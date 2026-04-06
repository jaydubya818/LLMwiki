import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import { v4 as uuid } from "uuid";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";
import { computePageFreshness } from "./freshness.js";
import { DEFAULT_DOMAIN_FOLDERS } from "./coverage-gaps.js";

export type DriftStatus = "new" | "reviewing" | "resolved" | "ignored";

export interface KnowledgeDriftItem {
  id: string;
  pagePath: string;
  summary: string;
  likelyCause: string;
  newerSourcesHint: string[];
  severity: "low" | "medium" | "high";
  detectedAt: string;
  status: DriftStatus;
}

export interface KnowledgeDriftFile {
  version: 1;
  updatedAt: string;
  items: KnowledgeDriftItem[];
}

async function newestRawMtimeInDomain(paths: BrainPaths, domain: string): Promise<number | undefined> {
  const pattern = path.join(paths.raw, domain, "**/*").replace(/\\/g, "/");
  const files = await fg(pattern, { onlyFiles: true });
  let max: number | undefined;
  for (const f of files) {
    const st = await fs.stat(f);
    if (max == null || st.mtimeMs > max) max = st.mtimeMs;
  }
  return max;
}

export async function readKnowledgeDrift(paths: BrainPaths): Promise<KnowledgeDriftFile> {
  try {
    const raw = await fs.readFile(paths.knowledgeDriftJson, "utf8");
    return JSON.parse(raw) as KnowledgeDriftFile;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), items: [] };
  }
}

export async function writeKnowledgeDrift(paths: BrainPaths, f: KnowledgeDriftFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.knowledgeDriftJson), { recursive: true });
  await fs.writeFile(
    paths.knowledgeDriftJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

export async function updateDriftItem(
  paths: BrainPaths,
  id: string,
  patch: Partial<Pick<KnowledgeDriftItem, "status">>
): Promise<KnowledgeDriftItem | null> {
  const f = await readKnowledgeDrift(paths);
  const idx = f.items.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  f.items[idx] = { ...f.items[idx]!, ...patch };
  await writeKnowledgeDrift(paths, f);
  return f.items[idx]!;
}

export async function scanKnowledgeDrift(
  cfg: BrainConfig,
  options: { maxItems?: number } = {}
): Promise<KnowledgeDriftFile> {
  const paths = brainPaths(cfg.root);
  const max = options.maxItems ?? 22;
  const candidates: KnowledgeDriftItem[] = [];
  const wikiFiles = await fg(
    path.join(paths.wiki, "**/*.md").replace(/\\/g, "/"),
    { onlyFiles: true }
  );

  const domainRawMtime = new Map<string, number | undefined>();
  for (const d of DEFAULT_DOMAIN_FOLDERS) {
    domainRawMtime.set(d, await newestRawMtimeInDomain(paths, d));
  }

  for (const abs of wikiFiles) {
    const rel = path.relative(cfg.root, abs).split(path.sep).join("/");
    const domain = rel.split("/")[1] ?? "topics";
    const fresh = await computePageFreshness(cfg, rel);
    const rawM = domainRawMtime.get(domain);
    let stWiki: number | undefined;
    try {
      stWiki = (await fs.stat(abs)).mtimeMs;
    } catch {
      stWiki = undefined;
    }

    if (fresh.category !== "stale" && fresh.category !== "mixed") continue;
    if (!rawM || !stWiki || rawM <= stWiki + 2 * 86400 * 1000) continue;

    const fm = matter(await fs.readFile(abs, "utf8")).data as { sources?: string[] };
    const srcN = Array.isArray(fm.sources) ? fm.sources.length : 0;

    candidates.push({
      id: uuid(),
      pagePath: rel,
      summary:
        "Wiki may lag newer material in the same domain folder — conclusions might need reconciliation.",
      likelyCause: `Raw activity in '${domain}' is newer than this wiki file mtime; freshness=${fresh.category}.`,
      newerSourcesHint: [`raw/${domain}/ (newer activity)`],
      severity: srcN === 0 ? "high" : fresh.category === "stale" ? "medium" : "low",
      detectedAt: new Date().toISOString(),
      status: "new",
    });
  }

  candidates.sort((a, b) => {
    const s = { high: 3, medium: 2, low: 1 };
    return s[b.severity] - s[a.severity];
  });

  const prev = await readKnowledgeDrift(paths);
  const inProg = prev.items.filter((i) => i.status !== "new");
  const byPage = new Map(inProg.map((i) => [i.pagePath, i]));
  const merged: KnowledgeDriftItem[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (merged.length >= max) break;
    const ex = byPage.get(c.pagePath);
    if (ex?.status === "resolved" || ex?.status === "ignored") {
      merged.push(ex);
      seen.add(c.pagePath);
      continue;
    }
    if (ex?.status === "reviewing") {
      merged.push({ ...ex, summary: c.summary, likelyCause: c.likelyCause, severity: c.severity });
      seen.add(c.pagePath);
      continue;
    }
    merged.push(c);
    seen.add(c.pagePath);
  }
  for (const p of inProg) {
    if (!seen.has(p.pagePath)) merged.push(p);
  }

  const file: KnowledgeDriftFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: merged,
  };
  await writeKnowledgeDrift(paths, file);
  return file;
}

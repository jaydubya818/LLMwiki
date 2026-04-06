import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import { v4 as uuid } from "uuid";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";
import { readWikiTrace } from "./trace.js";
import { parseWikiEditPolicy } from "./canonical-lock.js";

export type UnsupportedClaimStatus = "new" | "reviewing" | "resolved" | "ignored";

export interface UnsupportedClaimItem {
  id: string;
  pagePath: string;
  sectionAnchor?: string;
  excerpt: string;
  reason: string;
  severity: "low" | "medium" | "high";
  sourceCount: number;
  createdAt: string;
  updatedAt: string;
  status: UnsupportedClaimStatus;
  relatedRunId?: string;
}

export interface UnsupportedClaimsFile {
  version: 1;
  updatedAt: string;
  items: UnsupportedClaimItem[];
}

const DECISIONISH = /\b(we decided|final decision|conclusion:|therefore,? the|resolution:|go\/no-go)\b/i;

export async function readUnsupportedClaims(
  paths: BrainPaths
): Promise<UnsupportedClaimsFile> {
  try {
    const raw = await fs.readFile(paths.unsupportedClaimsJson, "utf8");
    return JSON.parse(raw) as UnsupportedClaimsFile;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), items: [] };
  }
}

export async function writeUnsupportedClaims(
  paths: BrainPaths,
  file: UnsupportedClaimsFile
): Promise<void> {
  await fs.mkdir(path.dirname(paths.unsupportedClaimsJson), { recursive: true });
  await fs.writeFile(
    paths.unsupportedClaimsJson,
    JSON.stringify({ ...file, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

export async function updateUnsupportedClaim(
  paths: BrainPaths,
  id: string,
  patch: Partial<Pick<UnsupportedClaimItem, "status" | "severity" | "excerpt" | "relatedRunId">>
): Promise<UnsupportedClaimItem | null> {
  const f = await readUnsupportedClaims(paths);
  const idx = f.items.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  f.items[idx] = { ...f.items[idx]!, ...patch, updatedAt: new Date().toISOString() };
  await writeUnsupportedClaims(paths, f);
  return f.items[idx]!;
}

/** Conservative scan — caps list size, prefers high-signal flags. */
export async function scanUnsupportedClaims(
  cfg: BrainConfig,
  options: { maxItems?: number; relatedRunId?: string } = {}
): Promise<UnsupportedClaimsFile> {
  const paths = brainPaths(cfg.root);
  const max = options.maxItems ?? 28;
  const candidates: UnsupportedClaimItem[] = [];
  const wikiFiles = await fg(
    path.join(paths.wiki, "**/*.md").replace(/\\/g, "/"),
    { onlyFiles: true }
  );

  for (const abs of wikiFiles) {
    const rel = path.relative(cfg.root, abs).split(path.sep).join("/");
    const raw = await fs.readFile(abs, "utf8");
    const { content, data } = matter(raw);
    const fm = data as { sources?: string[]; title?: string };
    const sources = Array.isArray(fm.sources) ? fm.sources.filter((s) => s.startsWith("raw/")) : [];
    const trace = await readWikiTrace(paths, rel);
    const policy = parseWikiEditPolicy(data as Record<string, unknown>);
    const bodyLen = content.trim().length;

    let severity: UnsupportedClaimItem["severity"] = "low";
    let reason = "";
    if (sources.length === 0 && bodyLen > 350) {
      severity = bodyLen > 1200 ? "medium" : "low";
      reason = "No raw sources in frontmatter while page has substantial prose.";
    } else if (sources.length === 1 && DECISIONISH.test(content) && bodyLen > 400) {
      severity = "high";
      reason = "Decision-like language with only one listed raw source.";
    } else if (!trace && sources.length > 0 && bodyLen > 500) {
      severity = "low";
      reason = "Has sources but no claim-trace sidecar yet — section support not inspected.";
    } else if (trace?.sections?.every((s) => s.support === "synthesized") && sources.length < 2) {
      severity = "medium";
      reason = "Trace shows only synthesized sections with few sources.";
    } else {
      continue;
    }

    if (policy === "locked" || policy === "manual_review") {
      severity = severity === "high" ? "high" : "low";
      reason += " (Canonical lock — double-check before changing.)";
    }

    const excerpt =
      content
        .split(/\n\n+/)[0]
        ?.replace(/^#+\s+/, "")
        .slice(0, 220)
        .trim() + "…";

    candidates.push({
      id: uuid(),
      pagePath: rel,
      excerpt,
      reason: reason.trim(),
      severity,
      sourceCount: sources.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "new",
      relatedRunId: options.relatedRunId,
    });
  }

  candidates.sort((a, b) => {
    const s = { high: 3, medium: 2, low: 1 };
    return s[b.severity] - s[a.severity];
  });

  const prev = await readUnsupportedClaims(paths);
  const keyOf = (i: UnsupportedClaimItem) => `${i.pagePath}\n${i.reason}`;
  const now = new Date().toISOString();
  const inProgress = prev.items.filter((i) => i.status !== "new");
  const inProgByKey = new Map(inProgress.map((i) => [keyOf(i), i]));

  const merged: UnsupportedClaimItem[] = [];
  const usedKeys = new Set<string>();

  for (const c of candidates) {
    if (merged.length >= max) break;
    const key = keyOf(c);
    if (usedKeys.has(key)) continue;
    const existing = inProgByKey.get(key);
    if (existing?.status === "resolved" || existing?.status === "ignored") {
      merged.push(existing);
      usedKeys.add(key);
      continue;
    }
    if (existing?.status === "reviewing") {
      merged.push({
        ...existing,
        severity: c.severity,
        sourceCount: c.sourceCount,
        excerpt: c.excerpt,
        updatedAt: now,
      });
      usedKeys.add(key);
      continue;
    }
    merged.push(c);
    usedKeys.add(key);
  }

  for (const it of inProgress) {
    if (!usedKeys.has(keyOf(it))) merged.push(it);
  }

  const file: UnsupportedClaimsFile = {
    version: 1,
    updatedAt: now,
    items: merged,
  };
  await writeUnsupportedClaims(paths, file);
  return file;
}

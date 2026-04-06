import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import fg from "fast-glob";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";

export type SupersessionStatus = "suggested" | "confirmed" | "ignored";

export interface SourceSupersessionRecord {
  id: string;
  olderSource: string;
  newerSource: string;
  topic: string;
  confidence: "low" | "medium";
  reason: string;
  detectedAt: string;
  status: SupersessionStatus;
}

export interface SourceSupersessionFile {
  version: 1;
  updatedAt: string;
  items: SourceSupersessionRecord[];
}

export async function readSourceSupersession(paths: BrainPaths): Promise<SourceSupersessionFile> {
  try {
    const raw = await fs.readFile(paths.sourceSupersessionJson, "utf8");
    return JSON.parse(raw) as SourceSupersessionFile;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), items: [] };
  }
}

export async function writeSourceSupersession(paths: BrainPaths, f: SourceSupersessionFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.sourceSupersessionJson), { recursive: true });
  await fs.writeFile(
    paths.sourceSupersessionJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

const DATE_IN_NAME =
  /^(?<base>.+?)[-–_\s]+(?<d>\d{4}-\d{2}(?:-\d{2})?)(?:[-–_\s]v(?<v>\d+))?\.(?<ext>[a-z0-9]+)$/i;

function normalizeTopicKey(base: string): string {
  return base
    .toLowerCase()
    .replace(/\d{4}-\d{2}(-\d{2})?/g, "")
    .replace(/v\d+/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Conservative same-folder date/version pairs — not semantic “truth”. */
export async function scanSourceSupersession(cfg: BrainConfig): Promise<SourceSupersessionFile> {
  const paths = brainPaths(cfg.root);
  const files = await fg(path.join(paths.raw, "**/*").replace(/\\/g, "/"), {
    onlyFiles: true,
  });

  type Entry = { rel: string; mtime: number; parsed?: { base: string; date?: string; v?: string } };
  const entries: Entry[] = [];

  for (const abs of files) {
    const rel = path.relative(cfg.root, abs).split(path.sep).join("/");
    if (!rel.startsWith("raw/")) continue;
    const st = await fs.stat(abs);
    const name = path.basename(rel);
    const m = DATE_IN_NAME.exec(name);
    entries.push({
      rel,
      mtime: st.mtimeMs,
      parsed: m?.groups
        ? {
            base: m.groups.base ?? name,
            date: m.groups.d,
            v: m.groups.v,
          }
        : undefined,
    });
  }

  const byDirTopic = new Map<string, Entry[]>();
  for (const e of entries) {
    const dir = path.dirname(e.rel);
    const key =
      e.parsed?.base != null
        ? `${dir}::${normalizeTopicKey(e.parsed.base)}`
        : `${dir}::${normalizeTopicKey(path.basename(e.rel, path.extname(e.rel)))}`;
    const arr = byDirTopic.get(key) ?? [];
    arr.push(e);
    byDirTopic.set(key, arr);
  }

  const items: SourceSupersessionRecord[] = [];
  const prev = await readSourceSupersession(paths);
  const prevByPair = new Map<string, SourceSupersessionRecord>();
  for (const x of prev.items) {
    prevByPair.set(`${x.olderSource}|${x.newerSource}`, x);
  }

  for (const group of byDirTopic.values()) {
    if (group.length < 2) continue;
    const dated = group.filter((g) => g.parsed?.date);
    if (dated.length < 2) continue;
    dated.sort((a, b) => a.mtime - b.mtime);
    for (let i = 0; i < dated.length - 1; i++) {
      const older = dated[i]!;
      const newer = dated[i + 1]!;
      if (newer.mtime < older.mtime + 86_400_000) continue; // need ≥1d separation
      const topic = older.parsed?.base ?? path.basename(older.rel);
      const pairKey = `${older.rel}|${newer.rel}`;
      const oldRec = prevByPair.get(pairKey);
      if (oldRec?.status === "ignored") continue;
      const id =
        oldRec?.id ??
        crypto.createHash("sha256").update(pairKey).digest("hex").slice(0, 16);
      items.push({
        id,
        olderSource: older.rel,
        newerSource: newer.rel,
        topic,
        confidence: "low",
        reason: "Same topic stem with different date token in filename + newer file newer mtime — confirm in context.",
        detectedAt: oldRec?.detectedAt ?? new Date().toISOString(),
        status: oldRec?.status === "confirmed" ? "confirmed" : "suggested",
      });
    }
  }

  items.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
  const merged = items.slice(0, 80);

  const file: SourceSupersessionFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: merged,
  };
  await writeSourceSupersession(paths, file);
  return file;
}

export async function updateSupersessionStatus(
  paths: BrainPaths,
  id: string,
  status: SupersessionStatus
): Promise<SourceSupersessionRecord | null> {
  const f = await readSourceSupersession(paths);
  const idx = f.items.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  f.items[idx] = { ...f.items[idx]!, status };
  await writeSourceSupersession(paths, f);
  return f.items[idx]!;
}

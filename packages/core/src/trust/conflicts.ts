import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import { v4 as uuid } from "uuid";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";
import { extractWikilinks } from "../wiki/wikilinks.js";
import { slugifyWikiName } from "../wiki/wikilinks.js";

export type ConflictStatus =
  | "new"
  | "reviewing"
  | "resolved"
  | "accepted-as-tension"
  | "ignored";

export interface ConflictRecord {
  id: string;
  topic: string;
  summary: string;
  sourceA: string;
  sourceB: string;
  wikiRef?: string;
  conflictType: "status-mismatch" | "frontmatter-tension" | "heuristic";
  detectedAt: string;
  status: ConflictStatus;
  clarity: "low" | "medium";
  resolutionNote?: string;
  excerptA?: string;
  excerptB?: string;
}

export interface ConflictsFile {
  version: 1;
  updatedAt: string;
  items: ConflictRecord[];
}

const NEG = /^(cancelled|canceled|blocked|rejected|deprecated|paused|halted|withdrawn)$/i;
const POS = /^(active|accepted|done|shipped|approved|launched|green)$/i;

function normStatus(s: unknown): string | null {
  if (typeof s !== "string") return null;
  return s.trim().toLowerCase();
}

export async function readConflicts(paths: BrainPaths): Promise<ConflictsFile> {
  try {
    const raw = await fs.readFile(paths.conflictsJson, "utf8");
    return JSON.parse(raw) as ConflictsFile;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), items: [] };
  }
}

export async function writeConflicts(paths: BrainPaths, f: ConflictsFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.conflictsJson), { recursive: true });
  await fs.writeFile(
    paths.conflictsJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

export async function updateConflict(
  paths: BrainPaths,
  id: string,
  patch: Partial<
    Pick<ConflictRecord, "status" | "resolutionNote" | "clarity">
  >
): Promise<ConflictRecord | null> {
  const f = await readConflicts(paths);
  const idx = f.items.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  f.items[idx] = { ...f.items[idx]!, ...patch };
  await writeConflicts(paths, f);
  return f.items[idx]!;
}

/**
 * Conservative: linked wiki pages with `status` frontmatter in opposing polarity sets.
 */
export async function scanConflicts(
  cfg: BrainConfig,
  options: { maxItems?: number } = {}
): Promise<ConflictsFile> {
  const paths = brainPaths(cfg.root);
  const max = options.maxItems ?? 16;
  const wikiFiles = await fg(
    path.join(paths.wiki, "**/*.md").replace(/\\/g, "/"),
    { onlyFiles: true }
  );

  const pageMeta = new Map<
    string,
    { rel: string; status: string | null; label: string; type?: string; contentSnippet: string }
  >();
  for (const abs of wikiFiles) {
    const rel = path.relative(cfg.root, abs).split(path.sep).join("/");
    const raw = await fs.readFile(abs, "utf8");
    const { content, data } = matter(raw);
    const fm = data as { status?: string; title?: string; type?: string };
    pageMeta.set(rel, {
      rel,
      status: normStatus(fm.status),
      label: fm.title ?? path.basename(rel, ".md"),
      type: fm.type,
      contentSnippet: content.slice(0, 400),
    });
  }

  const found: ConflictRecord[] = [];
  const seen = new Set<string>();

  for (const abs of wikiFiles) {
    const rel = path.relative(cfg.root, abs).split(path.sep).join("/");
    const raw = await fs.readFile(abs, "utf8");
    const { content } = matter(raw);
    const links = extractWikilinks(content);
    const a = pageMeta.get(rel);
    if (!a?.status) continue;

    for (const link of links) {
      const slug = slugifyWikiName(link.replace(/\.md$/i, ""));
      let targetRel: string | null = null;
      for (const [r, meta] of pageMeta) {
        if (slugifyWikiName(path.basename(r, ".md")) === slug) {
          targetRel = r;
          break;
        }
        if (slugifyWikiName(meta.label) === slug) {
          targetRel = r;
          break;
        }
      }
      if (!targetRel || targetRel === rel) continue;
      const b = pageMeta.get(targetRel);
      if (!b?.status) continue;
      const clash =
        (NEG.test(a.status) && POS.test(b.status)) || (POS.test(a.status) && NEG.test(b.status));
      if (!clash) continue;

      const key = [rel, targetRel].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      found.push({
        id: uuid(),
        topic: `${a.label} ↔ ${b.label}`,
        summary: `Linked pages show opposing status signals (${a.status} vs ${b.status}). May be stale wording — verify.`,
        sourceA: rel,
        sourceB: targetRel,
        wikiRef: rel,
        conflictType: "status-mismatch",
        detectedAt: new Date().toISOString(),
        status: "new",
        clarity: "low",
        excerptA: a.contentSnippet.slice(0, 200),
        excerptB: b.contentSnippet.slice(0, 200),
      });
      if (found.length >= max) break;
    }
    if (found.length >= max) break;
  }

  const prev = await readConflicts(paths);
  const frozen = prev.items.filter(
    (i) => i.status === "resolved" || i.status === "ignored" || i.status === "accepted-as-tension"
  );
  const keyF = (c: ConflictRecord) => [c.sourceA, c.sourceB].sort().join("|");
  const frozenKeys = new Set(frozen.map(keyF));

  const merged = [
    ...frozen,
    ...found.filter((f) => !frozenKeys.has(keyF(f))).slice(0, max),
  ];

  /* carry reviewing */
  for (const p of prev.items) {
    if (p.status === "reviewing" && !merged.some((m) => m.id === p.id)) {
      merged.push(p);
    }
  }

  const file: ConflictsFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: merged.slice(0, frozen.length + max + 8),
  };
  await writeConflicts(paths, file);
  return file;
}

export async function appendConflictResolutionNote(
  cfg: BrainConfig,
  conflictId: string,
  note: string,
  targetWikiRel?: string
): Promise<void> {
  const paths = brainPaths(cfg.root);
  const f = await readConflicts(paths);
  const c = f.items.find((x) => x.id === conflictId);
  if (!c) throw new Error("Conflict not found");
  const wikiPath = targetWikiRel ?? c.wikiRef;
  if (!wikiPath) return;
  const abs = path.join(cfg.root, wikiPath);
  const raw = await fs.readFile(abs, "utf8");
  const { content, data } = matter(raw);
  const block = `\n\n## Conflict resolution (${new Date().toISOString().slice(0, 10)})\n_${note}_\n`;
  await fs.writeFile(abs, matter.stringify(content.trim() + block, data), "utf8");
}

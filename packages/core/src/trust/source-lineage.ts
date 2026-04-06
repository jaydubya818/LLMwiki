import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";

export interface SourceInfluence {
  wikiPages: string[];
  outputs: string[];
  /** Decision wiki paths that list this source */
  decisions: string[];
}

export interface SourceLineageFile {
  version: 1;
  updatedAt: string;
  /** Repo-relative raw/output paths → downstream artifacts */
  bySource: Record<string, SourceInfluence>;
}

export async function readSourceLineage(paths: BrainPaths): Promise<SourceLineageFile | null> {
  try {
    const raw = await fs.readFile(paths.sourceLineageJson, "utf8");
    return JSON.parse(raw) as SourceLineageFile;
  } catch {
    return null;
  }
}

function add(
  map: Record<string, SourceInfluence>,
  src: string,
  patch: Partial<SourceInfluence>
): void {
  if (!src || !src.startsWith("raw/")) return;
  if (!map[src]) {
    map[src] = { wikiPages: [], outputs: [], decisions: [] };
  }
  const m = map[src]!;
  if (patch.wikiPages) {
    for (const p of patch.wikiPages) {
      if (!m.wikiPages.includes(p)) m.wikiPages.push(p);
    }
  }
  if (patch.outputs) {
    for (const p of patch.outputs) {
      if (!m.outputs.includes(p)) m.outputs.push(p);
    }
  }
  if (patch.decisions) {
    for (const p of patch.decisions) {
      if (!m.decisions.includes(p)) m.decisions.push(p);
    }
  }
}

/**
 * Raw-source-centric reverse index from wiki/output frontmatter `sources`.
 */
export async function buildSourceLineage(cfg: BrainConfig): Promise<SourceLineageFile> {
  const paths = brainPaths(cfg.root);
  const bySource: Record<string, SourceInfluence> = {};

  const wikiFiles = await fg(
    path.join(paths.wiki, "**/*.md").replace(/\\/g, "/"),
    { onlyFiles: true }
  );
  for (const abs of wikiFiles) {
    const rel = path.relative(cfg.root, abs).split(path.sep).join("/");
    const raw = await fs.readFile(abs, "utf8");
    const { data } = matter(raw);
    const fm = data as { sources?: string[]; type?: string };
    const srcs = Array.isArray(fm.sources) ? fm.sources : [];
    const isDecision =
      rel.startsWith("wiki/decisions/") || fm.type === "decision" || fm.type === "adr";
    for (const s of srcs) {
      const norm = s.replace(/^\//, "");
      if (norm.startsWith("raw/")) {
        add(bySource, norm, {
          wikiPages: [rel],
          ...(isDecision ? { decisions: [rel] } : {}),
        });
      }
    }
  }

  const outFiles = await fg(
    path.join(paths.outputs, "**/*.md").replace(/\\/g, "/"),
    { onlyFiles: true }
  );
  for (const abs of outFiles) {
    const rel = path.relative(cfg.root, abs).split(path.sep).join("/");
    const raw = await fs.readFile(abs, "utf8");
    const { data } = matter(raw);
    const fm = data as { sources?: string[] };
    const srcs = Array.isArray(fm.sources) ? fm.sources : [];
    for (const s of srcs) {
      const norm = s.replace(/^\//, "");
      if (norm.startsWith("raw/")) {
        add(bySource, norm, { outputs: [rel] });
      }
    }
  }

  const file: SourceLineageFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    bySource,
  };
  await fs.mkdir(path.dirname(paths.sourceLineageJson), { recursive: true });
  await fs.writeFile(paths.sourceLineageJson, JSON.stringify(file, null, 2), "utf8");
  return file;
}

export function getInfluenceForSource(
  lineage: SourceLineageFile | null,
  rawRel: string
): SourceInfluence | null {
  if (!lineage) return null;
  const k = rawRel.replace(/^\//, "");
  return lineage.bySource[k] ?? null;
}

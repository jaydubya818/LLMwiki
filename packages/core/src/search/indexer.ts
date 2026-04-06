import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { extensionSupported } from "../extract/text-extract.js";

export type SearchDocKind = "wiki" | "raw" | "output";

export interface SearchDoc {
  id: string;
  path: string;
  kind: SearchDocKind;
  text: string;
  mtimeMs: number;
}

export interface SearchIndex {
  builtAt: string;
  docs: SearchDoc[];
}

const MAX_DOC_CHARS = 200_000;

export async function buildSearchIndex(cfg: BrainConfig): Promise<SearchIndex> {
  const paths = brainPaths(cfg.root);
  const roots: Array<{ base: string; kind: SearchDocKind }> = [
    { base: paths.wiki, kind: "wiki" },
    { base: paths.raw, kind: "raw" },
    { base: paths.outputs, kind: "output" },
  ];

  const docs: SearchDoc[] = [];

  for (const { base, kind } of roots) {
    const pattern = path.join(base, "**/*").replace(/\\/g, "/");
    const files = await fg(pattern, { onlyFiles: true, dot: false });
    for (const abs of files) {
      const ext = path.extname(abs);
      if (!extensionSupported(ext) && ext !== ".md") continue;
      try {
        const stat = await fs.stat(abs);
        const rel = path.relative(cfg.root, abs).split(path.sep).join("/");
        let text = "";
        if (extensionSupported(ext) || ext === ".md") {
          text = await fs.readFile(abs, "utf8");
        }
        if (text.length > MAX_DOC_CHARS) {
          text = text.slice(0, MAX_DOC_CHARS);
        }
        docs.push({
          id: rel,
          path: rel,
          kind,
          text,
          mtimeMs: stat.mtimeMs,
        });
      } catch {
        /* skip */
      }
    }
  }

  const index: SearchIndex = {
    builtAt: new Date().toISOString(),
    docs,
  };
  await fs.mkdir(paths.brain, { recursive: true });
  await fs.writeFile(paths.searchIndexJson, JSON.stringify(index), "utf8");
  return index;
}

export async function loadSearchIndex(
  paths: ReturnType<typeof brainPaths>
): Promise<SearchIndex | null> {
  try {
    const raw = await fs.readFile(paths.searchIndexJson, "utf8");
    return JSON.parse(raw) as SearchIndex;
  } catch {
    return null;
  }
}

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { loadConfig } from "../config.js";
import {
  findBrainEntry,
  resolveBrainRootAbsolute,
} from "../workspace/registry.js";
import { appendLog } from "../log-append.js";
import { readPromotionQueue, writePromotionQueue } from "./candidates.js";

export interface PromoteOptions {
  rationale?: string;
  confidence?: string;
  /** Target subfolder under master wiki, default topics */
  masterWikiDomain?: string;
}

/**
 * Curated promotion: copy an artifact from source brain into master brain
 * with provenance frontmatter. Does not delete the source.
 */
export async function promoteBetweenBrains(
  workspaceRoot: string,
  sourceBrainName: string,
  targetBrainName: string,
  fileRelativeToBrainRoot: string,
  options: PromoteOptions = {}
): Promise<{ destAbs: string }> {
  const ws = path.resolve(workspaceRoot);
  const sourceEntry = await findBrainEntry(ws, sourceBrainName);
  const targetEntry = await findBrainEntry(ws, targetBrainName);
  if (!sourceEntry || !targetEntry) {
    throw new Error("Source or target brain not found in registry.");
  }

  const sourceRoot = resolveBrainRootAbsolute(ws, sourceEntry);
  const targetRoot = resolveBrainRootAbsolute(ws, targetEntry);

  const safe = fileRelativeToBrainRoot.replace(/^\/+/, "").replace(/\.\./g, "");
  const srcAbs = path.join(sourceRoot, safe.split("/").join(path.sep));
  if (!srcAbs.startsWith(path.resolve(sourceRoot))) {
    throw new Error("Invalid path");
  }

  const raw = await fs.readFile(srcAbs, "utf8");
  const { content, data } = matter(raw);
  const fm = {
    ...(data as Record<string, unknown>),
    promoted_from_brain: sourceBrainName,
    promoted_from_path: safe,
    promoted_at: new Date().toISOString().slice(0, 10),
    promotion_rationale:
      options.rationale ??
      (data as { promotion_rationale?: string }).promotion_rationale ??
      "Curated promotion",
    promotion_confidence: options.confidence ?? "unspecified",
  };

  const base = path.basename(safe, ".md");
  const domain = options.masterWikiDomain ?? "topics";
  const destDir =
    safe.startsWith("wiki/")
      ? path.join(
          targetRoot,
          "wiki",
          path.dirname(safe.slice("wiki/".length)).split("/").join(path.sep)
        )
      : path.join(targetRoot, "wiki", domain);

  await fs.mkdir(destDir, { recursive: true });
  const destName =
    safe.startsWith("wiki/") || safe.startsWith("outputs/")
      ? `promoted-${sourceBrainName}-${base}.md`
      : `${base}.md`;
  const destAbs = path.join(destDir, destName);
  await fs.writeFile(destAbs, matter.stringify(content, fm), "utf8");

  const tPaths = brainPaths(targetRoot);
  await appendLog(
    tPaths,
    `promotion: from ${sourceBrainName} ${safe} → ${path.relative(targetRoot, destAbs)}`
  );

  const q = await readPromotionQueue(sourceRoot);
  q.candidates = q.candidates.filter((c) => c.relPath !== safe);
  await writePromotionQueue(sourceRoot, q);

  return { destAbs };
}

export async function buildBrainConfigForName(
  workspaceRoot: string,
  brainName: string
): Promise<BrainConfig> {
  const entry = await findBrainEntry(path.resolve(workspaceRoot), brainName);
  if (!entry) throw new Error(`Unknown brain ${brainName}`);
  const brainRoot = resolveBrainRootAbsolute(path.resolve(workspaceRoot), entry);
  const wikiGitPrefix = `${entry.path}/wiki`.replace(/\\/g, "/").replace(/\/$/, "");
  return loadConfig(brainRoot, {
    gitRoot: path.resolve(workspaceRoot),
    wikiGitPrefix,
    brainName: entry.name,
    workspaceRoot: path.resolve(workspaceRoot),
  });
}

/** Re-export for CLI */
export type { BrainConfig as PromoteBrainConfig };

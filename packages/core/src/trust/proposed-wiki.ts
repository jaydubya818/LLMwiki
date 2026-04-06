import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { BrainPaths } from "../paths.js";

export interface ProposedWikiMeta {
  targetWikiRel: string;
  reason: "wiki_edit_policy" | "canonical";
  rawSourceRel: string;
  policy: string;
  planSummary?: string;
}

export async function writeProposedWikiUpdate(
  paths: BrainPaths,
  proposedMarkdown: string,
  meta: ProposedWikiMeta
): Promise<string> {
  await fs.mkdir(paths.proposedWikiUpdatesDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safe = meta.targetWikiRel.replace(/[^\w./-]+/g, "_").split("/").join("_");
  const fname = `${stamp}-${safe.slice(0, 120)}.md`;
  const abs = path.join(paths.proposedWikiUpdatesDir, fname);
  const fm = {
    type: "proposed_wiki_update",
    target_wiki: meta.targetWikiRel,
    reason: meta.reason,
    raw_source: meta.rawSourceRel,
    wiki_edit_policy: meta.policy,
    created_at: new Date().toISOString(),
    plan_summary: meta.planSummary,
  };
  const doc = matter.stringify(proposedMarkdown, fm);
  await fs.writeFile(abs, doc, "utf8");
  return path.relative(paths.root, abs).split(path.sep).join("/");
}

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { BrainConfig } from "../config.js";

export interface DecisionDraftPreview {
  wikiRel: string;
  markdown: string;
}

function slugifySegment(s: string): string {
  const x = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 56);
  return x || "decision";
}

function inferDomain(rel: string): string {
  const parts = rel.split("/").filter(Boolean);
  if (rel.startsWith("raw/") && parts.length >= 2) return parts[1]!;
  if (rel.startsWith("outputs/") && parts.length >= 2) return parts[1]!;
  return "general";
}

function excerptBlock(content: string, maxLen: number): string {
  const lines = content.trim().split(/\n/).slice(0, 16);
  const block = lines.join("\n").trim();
  if (block.length <= maxLen) return block;
  return `${block.slice(0, maxLen - 1)}…`;
}

/**
 * Build a decision stub markdown (not written). Source must be `raw/...` or `outputs/...`.
 * Sets `include_in_ledger: false` so `refreshDecisionLedger` skips it until you promote.
 */
export async function buildDecisionDraftPreview(
  cfg: BrainConfig,
  sourceRel: string,
  options?: { slugHint?: string }
): Promise<DecisionDraftPreview> {
  const norm = sourceRel.replace(/^\//, "").trim();
  if (!norm.startsWith("raw/") && !norm.startsWith("outputs/")) {
    throw new Error("Source path must be under raw/ or outputs/");
  }
  const abs = path.join(cfg.root, norm);
  const fileRaw = await fs.readFile(abs, "utf8");
  const { content, data } = matter(fileRaw);
  const fm = data as { title?: string };
  let titleFromH1: string | undefined;
  const hm = /^#\s+(.+)$/m.exec(content.trim());
  if (hm) {
    const h1 = hm[1]!.trim();
    if (h1) titleFromH1 = h1;
  }
  const title =
    (fm.title ?? titleFromH1) ||
    path.basename(norm, path.extname(norm)).replace(/[-_]/g, " ");
  const slugBase = slugifySegment(options?.slugHint ?? title);
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").replace(/\.\d{3}Z$/, "").slice(0, 14);
  const wikiRel = `wiki/decisions/${slugBase}-${stamp}.md`;
  const lastUpdated = new Date().toISOString().slice(0, 10);
  const domain = inferDomain(norm);
  const excerpt = excerptBlock(content, 900);

  const body = `Stub created from source \`${norm}\`. **Not** in the decision ledger until you set \`include_in_ledger: true\` in frontmatter and refresh the ledger.

## Context

_(Summarize the situation.)_

## Decision

_(What was decided?)_

## Rationale

_(Why this over alternatives?)_

## Alternatives considered

- 

## Consequences

_(What changes after this decision?)_

## Source excerpt

\`\`\`
${excerpt}
\`\`\`
`;

  const frontmatter = {
    title,
    type: "decision",
    status: "draft",
    include_in_ledger: false,
    last_updated: lastUpdated,
    sources: [norm],
    domain,
    context: "",
    decision: "",
    rationale: "",
    alternatives: [] as string[],
    consequences: "",
    related: [] as string[],
  };

  const markdown = matter.stringify(body, frontmatter);
  return { wikiRel, markdown };
}

/** Write preview to disk under vault root. */
export async function writeDecisionDraftFromPreview(
  cfg: BrainConfig,
  preview: DecisionDraftPreview
): Promise<string> {
  if (!preview.wikiRel.startsWith("wiki/decisions/")) {
    throw new Error("Invalid decision draft path");
  }
  const abs = path.resolve(cfg.root, preview.wikiRel);
  const rootAbs = path.resolve(cfg.root);
  const rootPrefix = rootAbs.endsWith(path.sep) ? rootAbs : `${rootAbs}${path.sep}`;
  if (abs !== rootAbs && !abs.startsWith(rootPrefix)) {
    throw new Error("Decision draft path escapes vault root");
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, preview.markdown, "utf8");
  return preview.wikiRel;
}

import path from "node:path";
import { readPromotionQueue, scanPromotionSignals } from "./candidates.js";
import { findBrainEntry, resolveBrainRootAbsolute } from "../workspace/registry.js";

export interface PromoteReviewRow {
  relPath: string;
  kind: string;
  confidence?: string;
  rationale?: string;
  source: "queue" | "frontmatter";
}

export async function gatherPromotionReview(
  workspaceRoot: string,
  sourceBrainName: string
): Promise<PromoteReviewRow[]> {
  const ws = path.resolve(workspaceRoot);
  const entry = await findBrainEntry(ws, sourceBrainName);
  if (!entry) throw new Error(`Unknown brain ${sourceBrainName}`);
  const root = resolveBrainRootAbsolute(ws, entry);
  const q = await readPromotionQueue(root);
  const scanned = await scanPromotionSignals(root);
  const rows: PromoteReviewRow[] = [
    ...q.candidates.map((c) => ({
      relPath: c.relPath,
      kind: c.kind,
      confidence: c.confidence,
      rationale: c.rationale,
      source: "queue" as const,
    })),
    ...scanned.map((c) => ({
      relPath: c.relPath,
      kind: c.kind,
      confidence: c.confidence,
      rationale: c.rationale,
      source: "frontmatter" as const,
    })),
  ];
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.relPath)) return false;
    seen.add(r.relPath);
    return true;
  });
}

export async function promoteReviewMarkdown(
  workspaceRoot: string,
  sourceBrainName: string
): Promise<string> {
  const rows = await gatherPromotionReview(workspaceRoot, sourceBrainName);
  const lines = [
    `# Promotion candidates — ${sourceBrainName}`,
    "",
    ...rows.map(
      (r) =>
        `- \`${r.relPath}\` (${r.kind}, ${r.source})${r.rationale ? ` — ${r.rationale}` : ""}`
    ),
  ];
  if (rows.length === 0) lines.push("_No candidates (queue empty and no promotion_candidate frontmatter)._");
  return lines.join("\n");
}

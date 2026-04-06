import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import { brainPaths } from "../paths.js";
import { promotionQueuePath } from "../workspace/paths.js";

export interface PromotionCandidate {
  relPath: string;
  kind: "output" | "wiki" | "manual";
  addedAt: string;
  confidence?: "low" | "medium" | "high";
  rationale?: string;
}

export interface PromotionQueue {
  version: 1;
  candidates: PromotionCandidate[];
}

export async function readPromotionQueue(brainRoot: string): Promise<PromotionQueue> {
  try {
    const raw = await fs.readFile(promotionQueuePath(brainRoot), "utf8");
    return JSON.parse(raw) as PromotionQueue;
  } catch {
    return { version: 1, candidates: [] };
  }
}

export async function writePromotionQueue(
  brainRoot: string,
  q: PromotionQueue
): Promise<void> {
  const p = promotionQueuePath(brainRoot);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(q, null, 2), "utf8");
}

export async function addPromotionCandidate(
  brainRoot: string,
  c: Omit<PromotionCandidate, "addedAt"> & { addedAt?: string }
): Promise<void> {
  const q = await readPromotionQueue(brainRoot);
  const full: PromotionCandidate = {
    ...c,
    addedAt: c.addedAt ?? new Date().toISOString(),
  };
  if (!q.candidates.some((x) => x.relPath === full.relPath)) {
    q.candidates.push(full);
  }
  await writePromotionQueue(brainRoot, q);
}

/** Scan markdown for promotion_candidate frontmatter */
export async function scanPromotionSignals(
  brainRoot: string
): Promise<PromotionCandidate[]> {
  const paths = brainPaths(brainRoot);
  const patterns = [
    path.join(paths.outputs, "**/*.md").replace(/\\/g, "/"),
    path.join(paths.wiki, "**/*.md").replace(/\\/g, "/"),
  ];
  const found: PromotionCandidate[] = [];
  for (const pattern of patterns) {
    const files = await fg(pattern, { onlyFiles: true });
    for (const abs of files) {
      const rel = path.relative(brainRoot, abs).split(path.sep).join("/");
      const raw = await fs.readFile(abs, "utf8");
      const { data } = matter(raw);
      const d = data as {
        promotion_candidate?: boolean;
        promotion_rationale?: string;
        promotion_confidence?: string;
      };
      if (d.promotion_candidate) {
        found.push({
          relPath: rel,
          kind: rel.startsWith("wiki/") ? "wiki" : "output",
          addedAt: new Date().toISOString(),
          confidence:
            d.promotion_confidence === "high" || d.promotion_confidence === "low"
              ? d.promotion_confidence
              : "medium",
          rationale: d.promotion_rationale,
        });
      }
    }
  }
  return found;
}

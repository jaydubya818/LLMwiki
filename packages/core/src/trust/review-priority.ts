import fs from "node:fs/promises";
import path from "node:path";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";
import type { KnowledgeGraph } from "../graph/builder.js";
import { readPageQuality } from "./page-quality.js";
import { readUnsupportedClaims } from "./unsupported-claims.js";
import { readConflicts } from "./conflicts.js";
import { readKnowledgeDrift } from "./knowledge-drift.js";
import { readOpenLoops } from "./open-loops.js";
import { parseWikiEditPolicy } from "./canonical-lock.js";
import matter from "gray-matter";

export interface ReviewPriorityRow {
  path: string;
  priority0to100: number;
  bucket: "urgent" | "soon" | "when-ready";
  why: string[];
}

export interface ReviewPriorityFile {
  version: 1;
  updatedAt: string;
  queue: ReviewPriorityRow[];
}

export async function readReviewPriority(paths: BrainPaths): Promise<ReviewPriorityFile | null> {
  try {
    const raw = await fs.readFile(paths.reviewPriorityJson, "utf8");
    return JSON.parse(raw) as ReviewPriorityFile;
  } catch {
    return null;
  }
}

export async function writeReviewPriority(paths: BrainPaths, f: ReviewPriorityFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.reviewPriorityJson), { recursive: true });
  await fs.writeFile(
    paths.reviewPriorityJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

export async function buildReviewPriorityQueue(
  cfg: BrainConfig,
  graph?: KnowledgeGraph | null
): Promise<ReviewPriorityFile> {
  const paths = brainPaths(cfg.root);
  const pq = await readPageQuality(paths);
  const unsupported = await readUnsupportedClaims(paths);
  const conflicts = await readConflicts(paths);
  const drift = await readKnowledgeDrift(paths);
  const loops = await readOpenLoops(paths);

  const unsCount = new Map<string, number>();
  for (const u of unsupported.items) {
    if (u.status === "resolved" || u.status === "ignored") continue;
    unsCount.set(u.pagePath, (unsCount.get(u.pagePath) ?? 0) + 1);
  }
  const loopCount = new Map<string, number>();
  for (const l of loops.items) {
    if (l.status === "resolved" || l.status === "ignored") continue;
    if (!l.sourcePath.startsWith("wiki/")) continue;
    loopCount.set(l.sourcePath, (loopCount.get(l.sourcePath) ?? 0) + 1);
  }
  const driftSet = new Set(
    drift.items.filter((d) => d.status !== "resolved" && d.status !== "ignored").map((d) => d.pagePath)
  );
  const conflictSet = new Set<string>();
  for (const c of conflicts.items) {
    if (c.status === "resolved" || c.status === "ignored" || c.status === "accepted-as-tension")
      continue;
    conflictSet.add(c.sourceA);
    conflictSet.add(c.sourceB);
    if (c.wikiRef) conflictSet.add(c.wikiRef);
  }

  const inHub = new Map<string, number>();
  if (graph) {
    for (const n of graph.nodes) inHub.set(n.id, n.hubScore);
  }

  const rows: ReviewPriorityRow[] = [];
  const pageRows = pq?.pages ?? [];

  for (const pr of pageRows) {
    let score = 50;
    const why: string[] = [];

    if (pr.bucket === "low") {
      score += 22;
      why.push("Low page quality bucket.");
    } else if (pr.bucket === "medium") {
      score += 10;
      why.push("Medium page quality — worth periodic review.");
    }

    score += (100 - pr.score0to100) * 0.25;

    const uns = unsCount.get(pr.path) ?? 0;
    if (uns > 0) {
      score += 14 + uns * 6;
      why.push(`${uns} unsupported-claim flag(s).`);
    }
    if (driftSet.has(pr.path)) {
      score += 15;
      why.push("Knowledge drift suspect.");
    }
    if (conflictSet.has(pr.path)) {
      score += 18;
      why.push("Open conflict involves this page.");
    }
    const lp = loopCount.get(pr.path) ?? 0;
    if (lp > 0) {
      score += 8 + lp * 3;
      why.push(`${lp} open loop(s) reference this page.`);
    }

    try {
      const raw = await fs.readFile(path.join(cfg.root, pr.path), "utf8");
      const pol = parseWikiEditPolicy(matter(raw).data as Record<string, unknown>);
      if (pol === "locked" || pol === "manual_review") {
        score += 12;
        why.push("Canonical / locked page — human review matters.");
      }
    } catch {
      /* skip */
    }

    const hub = inHub.get(pr.path) ?? 0;
    if (hub > 0.35) {
      score += 10;
      why.push("High graph centrality — changes ripple.");
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    let bucket: ReviewPriorityRow["bucket"] = "when-ready";
    if (score >= 72) bucket = "urgent";
    else if (score >= 48) bucket = "soon";

    if (why.length === 0) why.push("Routine maintenance candidate.");

    rows.push({ path: pr.path, priority0to100: score, bucket, why });
  }

  rows.sort((a, b) => b.priority0to100 - a.priority0to100);

  const file: ReviewPriorityFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    queue: rows.slice(0, 80),
  };
  await writeReviewPriority(paths, file);
  return file;
}

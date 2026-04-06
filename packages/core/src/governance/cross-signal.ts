import fs from "node:fs/promises";
import path from "node:path";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";
import type { KnowledgeGraph } from "../graph/builder.js";
import { readPageQuality } from "../trust/page-quality.js";
import { readUnsupportedClaims } from "../trust/unsupported-claims.js";
import { readConflicts } from "../trust/conflicts.js";
import { readKnowledgeDrift } from "../trust/knowledge-drift.js";
import { readOpenLoops } from "../trust/open-loops.js";
import { readCanonicalBoard } from "./canonical-board.js";
import { readDriftDecisionLinks } from "./drift-decision-bridge.js";
import { readEvidenceDensity } from "./evidence-density.js";
import { readHumanReview } from "./human-review.js";
import { computePageFreshness } from "../trust/freshness.js";

export interface CrossSignalItem {
  path: string;
  dragonScore: number;
  /** Plain-language reasons — capped for signal/noise */
  signals: string[];
  /** short label */
  headline: string;
}

export interface CrossSignalFile {
  version: 1;
  updatedAt: string;
  items: CrossSignalItem[];
}

export async function readCrossSignal(paths: BrainPaths): Promise<CrossSignalFile | null> {
  try {
    const raw = await fs.readFile(paths.crossSignalCorrelationJson, "utf8");
    return JSON.parse(raw) as CrossSignalFile;
  } catch {
    return null;
  }
}

export async function writeCrossSignal(paths: BrainPaths, f: CrossSignalFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.crossSignalCorrelationJson), { recursive: true });
  await fs.writeFile(
    paths.crossSignalCorrelationJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

export async function buildCrossSignalCorrelation(
  cfg: BrainConfig,
  graph?: KnowledgeGraph | null
): Promise<CrossSignalFile> {
  const paths = brainPaths(cfg.root);
  const pq = await readPageQuality(paths);
  const uns = await readUnsupportedClaims(paths);
  const conf = await readConflicts(paths);
  const drift = await readKnowledgeDrift(paths);
  const loops = await readOpenLoops(paths);
  const board = await readCanonicalBoard(paths);
  const bridge = await readDriftDecisionLinks(paths);
  const ed = await readEvidenceDensity(paths);
  const hr = await readHumanReview(paths);

  const hub = new Map<string, number>();
  if (graph) for (const n of graph.nodes) hub.set(n.id, n.hubScore);

  const unsCount = new Map<string, number>();
  for (const u of uns.items) {
    if (u.status === "resolved" || u.status === "ignored") continue;
    unsCount.set(u.pagePath, (unsCount.get(u.pagePath) ?? 0) + 1);
  }
  const driftPages = new Set(
    drift.items.filter((d) => d.status !== "resolved" && d.status !== "ignored").map((d) => d.pagePath)
  );
  const driftDecisionPages = new Set<string>();
  for (const l of bridge?.links ?? []) {
    driftDecisionPages.add(l.pagePath);
  }
  const conflictPages = new Set<string>();
  for (const c of conf.items) {
    if (c.status === "resolved" || c.status === "ignored" || c.status === "accepted-as-tension")
      continue;
    conflictPages.add(c.sourceA);
    conflictPages.add(c.sourceB);
    if (c.wikiRef) conflictPages.add(c.wikiRef);
  }
  const loopCount = new Map<string, number>();
  for (const l of loops.items) {
    if (l.status === "resolved" || l.status === "ignored") continue;
    if (!l.sourcePath.startsWith("wiki/")) continue;
    loopCount.set(l.sourcePath, (loopCount.get(l.sourcePath) ?? 0) + 1);
  }
  const boardUrgent = new Set(
    (board?.items ?? []).filter((i) => i.urgency === "attention").map((i) => i.path)
  );
  const edLow = new Set((ed?.pages ?? []).filter((e) => e.bucket === "low").map((e) => e.path));
  const hrStale = new Set(
    (hr?.pages ?? [])
      .filter((p) => p.badge === "outdated-human-review" || p.badge === "review-needed")
      .map((p) => p.path)
  );

  const pathsAll = new Set<string>();
  for (const p of pq?.pages ?? []) pathsAll.add(p.path);
  for (const p of unsCount.keys()) pathsAll.add(p);
  for (const p of driftPages) pathsAll.add(p);
  for (const p of conflictPages) pathsAll.add(p);
  for (const p of boardUrgent) pathsAll.add(p);

  const items: CrossSignalItem[] = [];

  for (const pagePath of pathsAll) {
    const signals: string[] = [];
    let score = 0;

    const pr = pq?.pages.find((p) => p.path === pagePath);
    if (pr?.bucket === "low") {
      score += 18;
      signals.push("Low page quality.");
    } else if (pr?.bucket === "medium") {
      score += 6;
    }

    if (edLow.has(pagePath)) {
      score += 16;
      signals.push("Low evidence density.");
    }

    const u = unsCount.get(pagePath) ?? 0;
    if (u > 0) {
      score += 14 + u * 5;
      signals.push(`${u} unsupported-claim triage item(s).`);
    }

    if (driftPages.has(pagePath)) {
      score += 14;
      signals.push("Drift warning.");
    }
    if (driftDecisionPages.has(pagePath)) {
      score += 20;
      signals.push("Drift may affect decisions — see drift↔decision bridge.");
    }

    if (conflictPages.has(pagePath)) {
      score += 18;
      signals.push("Active conflict record.");
    }

    if (boardUrgent.has(pagePath)) {
      score += 12;
      signals.push("Canonical board: attention.");
    }

    const lp = loopCount.get(pagePath) ?? 0;
    if (lp > 0) {
      score += 8 + lp * 2;
      signals.push(`${lp} open loop(s) on page.`);
    }

    if (hrStale.has(pagePath)) {
      score += 10;
      signals.push("Human review stale or required.");
    }

    const h = hub.get(pagePath) ?? 0;
    if (h > 0.38) {
      score += 12;
      signals.push("High graph centrality.");
    }

    const fresh = await computePageFreshness(cfg, pagePath);
    if (fresh.category === "stale") {
      score += 10;
      signals.push("Freshness: stale.");
    }

    if (signals.length < 2 && score < 42) continue;

    score = Math.min(100, score);
    const headline =
      signals.length >= 3
        ? "Multiple trust signals — prioritize human read"
        : signals[0] ?? "Correlated review cue";

    items.push({
      path: pagePath,
      dragonScore: score,
      signals: signals.slice(0, 8),
      headline,
    });
  }

  items.sort((a, b) => b.dragonScore - a.dragonScore);

  const file: CrossSignalFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: items.slice(0, 40),
  };
  await writeCrossSignal(paths, file);
  return file;
}

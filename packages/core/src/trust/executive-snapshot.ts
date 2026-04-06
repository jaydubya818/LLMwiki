import fs from "node:fs/promises";
import path from "node:path";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";
import { readDecisionLedger } from "./decision-ledger.js";
import { readConflicts } from "./conflicts.js";
import { readKnowledgeDrift } from "./knowledge-drift.js";
import { readReviewPriority } from "./review-priority.js";
import { readOpenLoops } from "./open-loops.js";
import { readSynthesisHeatmap } from "./synthesis-heatmap.js";
import { computeDomainCoverage } from "./coverage-gaps.js";
import { listRuns } from "../runs.js";
import { readDriftDecisionLinks } from "../governance/drift-decision-bridge.js";
import { readCrossSignal } from "../governance/cross-signal.js";

export interface ExecutiveSnapshot {
  version: 1;
  generatedAt: string;
  headline: string;
  recentDecisions: { title: string; path: string; status: string }[];
  openConflicts: number;
  conflictSamples: { topic: string; id: string }[];
  driftAlerts: number;
  driftSamples: { pagePath: string; summary: string }[];
  driftWithDecisionImpact: number;
  reviewTop: { path: string; bucket: string; priority0to100: number }[];
  openLoopsHigh: { title: string; path: string }[];
  crossSignalTop: { path: string; dragonScore: number; headline: string }[];
  weakestDomain?: string;
  lastRunSummary?: string;
}

export async function readExecutiveSnapshot(paths: BrainPaths): Promise<ExecutiveSnapshot | null> {
  try {
    const raw = await fs.readFile(paths.executiveSnapshotJson, "utf8");
    return JSON.parse(raw) as ExecutiveSnapshot;
  } catch {
    return null;
  }
}

export async function writeExecutiveSnapshot(paths: BrainPaths, snap: ExecutiveSnapshot): Promise<void> {
  await fs.mkdir(path.dirname(paths.executiveSnapshotJson), { recursive: true });
  await fs.writeFile(paths.executiveSnapshotJson, JSON.stringify(snap, null, 2), "utf8");
}

export async function buildExecutiveSnapshot(cfg: BrainConfig): Promise<ExecutiveSnapshot> {
  const paths = brainPaths(cfg.root);
  const ledger = await readDecisionLedger(paths);
  const conflicts = await readConflicts(paths);
  const drift = await readKnowledgeDrift(paths);
  const queue = await readReviewPriority(paths);
  const loops = await readOpenLoops(paths);
  const heat = await readSynthesisHeatmap(paths);
  const coverage = await computeDomainCoverage(cfg);
  const runs = await listRuns(paths, 5);
  const driftDecision = await readDriftDecisionLinks(paths);
  const dragons = await readCrossSignal(paths);

  const openC = conflicts.items.filter(
    (i) =>
      i.status !== "resolved" && i.status !== "ignored" && i.status !== "accepted-as-tension"
  );
  const openD = drift.items.filter((i) => i.status !== "resolved" && i.status !== "ignored");

  const reviewTop =
    (queue?.queue ?? []).slice(0, 8).map((r) => ({
      path: r.path,
      bucket: r.bucket,
      priority0to100: r.priority0to100,
    }));

  const openLoopsHigh = loops.items
    .filter((l) => l.status === "open" && (l.priority === "high" || l.loopType === "decision"))
    .slice(0, 6)
    .map((l) => ({ title: l.title, path: l.sourcePath }));

  const covRows = coverage ?? [];
  const weakest =
    heat?.cells[0]?.domain ??
    [...covRows].sort((a, b) => b.gapScore - a.gapScore)[0]?.domain;
  const driftDecisionN = driftDecision?.links.length ?? 0;
  const crossTop = (dragons?.items ?? []).slice(0, 5).map((d) => ({
    path: d.path,
    dragonScore: d.dragonScore,
    headline: d.headline,
  }));

  const snap: ExecutiveSnapshot = {
    version: 1,
    generatedAt: new Date().toISOString(),
    headline: `${openC.length} open conflict(s), ${openD.length} drift watch(es)${driftDecisionN ? ` (${driftDecisionN} with decision impact)` : ""}, ${dragons?.items[0]?.path ?? (reviewTop.length ? reviewTop[0]!.path : "—")} top correlated review cue.`,
    recentDecisions: ledger.decisions.slice(0, 6).map((d) => ({
      title: d.title,
      path: d.wikiPath,
      status: d.status,
    })),
    openConflicts: openC.length,
    conflictSamples: openC.slice(0, 4).map((c) => ({ topic: c.topic, id: c.id })),
    driftAlerts: openD.length,
    driftSamples: openD.slice(0, 4).map((d) => ({ pagePath: d.pagePath, summary: d.summary })),
    driftWithDecisionImpact: driftDecisionN,
    reviewTop,
    openLoopsHigh,
    crossSignalTop: crossTop,
    weakestDomain: weakest,
    lastRunSummary: runs[0] ? `${runs[0].kind}: ${runs[0].summary}` : undefined,
  };

  await writeExecutiveSnapshot(paths, snap);
  return snap;
}

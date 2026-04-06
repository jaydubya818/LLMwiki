import fs from "node:fs/promises";
import type { BrainPaths } from "../paths.js";
import { brainPaths } from "../paths.js";
import type { BrainConfig } from "../config.js";
import { readPageQuality } from "../trust/page-quality.js";
import { readEvidenceDensity } from "./evidence-density.js";
import { readHumanReview } from "./human-review.js";
import { readUnsupportedClaims } from "../trust/unsupported-claims.js";
import { readConflicts } from "../trust/conflicts.js";
import { readKnowledgeDrift } from "../trust/knowledge-drift.js";
import { readCanonicalBoard } from "./canonical-board.js";
import { parseWikiEditPolicy } from "../trust/canonical-lock.js";
import matter from "gray-matter";
import path from "node:path";

export type ConfidenceTrend = "improving" | "declining" | "stable" | "unknown";

export interface ConfidenceSnapshot {
  at: string;
  /** 0–100 composite — same basis as advisory queues, not epistemic truth. */
  composite0to100: number;
  quality0to100?: number;
  evidence0to100?: number;
  openUnsupported: number;
  driftOpen: boolean;
  conflictOpen: boolean;
  humanBadge?: string;
  canonicalBoost: number;
}

export interface ConfidencePageHistory {
  path: string;
  snapshots: ConfidenceSnapshot[];
}

export interface ConfidenceHistoryFile {
  version: 1;
  updatedAt: string;
  pages: ConfidencePageHistory[];
}

const MAX_SNAPSHOTS_PER_PAGE = 24;

export async function readConfidenceHistory(paths: BrainPaths): Promise<ConfidenceHistoryFile | null> {
  try {
    const raw = await fs.readFile(paths.confidenceHistoryJson, "utf8");
    return JSON.parse(raw) as ConfidenceHistoryFile;
  } catch {
    return null;
  }
}

export async function writeConfidenceHistory(paths: BrainPaths, f: ConfidenceHistoryFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.confidenceHistoryJson), { recursive: true });
  await fs.writeFile(
    paths.confidenceHistoryJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

function trendFor(snapshots: ConfidenceSnapshot[]): ConfidenceTrend {
  if (snapshots.length < 2) return "unknown";
  const a = snapshots[snapshots.length - 1]!;
  const b = snapshots[snapshots.length - 2]!;
  const d = a.composite0to100 - b.composite0to100;
  if (d > 2) return "improving";
  if (d < -2) return "declining";
  return "stable";
}

export function summarizeConfidenceForPage(
  hist: ConfidenceHistoryFile | null,
  pagePath: string
): {
  trend: ConfidenceTrend;
  current?: ConfidenceSnapshot;
  recentDelta?: number;
  sparkline: number[];
} {
  const row = hist?.pages.find((p) => p.path === pagePath);
  if (!row?.snapshots.length) {
    return { trend: "unknown", sparkline: [] };
  }
  const cur = row.snapshots[row.snapshots.length - 1];
  const prev = row.snapshots[row.snapshots.length - 2];
  return {
    trend: trendFor(row.snapshots),
    current: cur,
    recentDelta:
      cur && prev ? cur.composite0to100 - prev.composite0to100 : undefined,
    sparkline: row.snapshots.map((s) => s.composite0to100),
  };
}

/**
 * Append one snapshot per wiki page (rolling) after operational signals exist.
 */
export async function appendConfidenceHistorySnapshots(
  cfg: BrainConfig,
  wikiRelPaths: string[]
): Promise<ConfidenceHistoryFile> {
  const paths = brainPaths(cfg.root);
  const pq = await readPageQuality(paths);
  const ed = await readEvidenceDensity(paths);
  const hr = await readHumanReview(paths);
  const uns = await readUnsupportedClaims(paths);
  const conf = await readConflicts(paths);
  const drift = await readKnowledgeDrift(paths);
  const board = await readCanonicalBoard(paths);

  const pqBy = new Map((pq?.pages ?? []).map((p) => [p.path, p]));
  const edBy = new Map((ed?.pages ?? []).map((p) => [p.path, p]));
  const hrBy = new Map((hr?.pages ?? []).map((p) => [p.path, p]));
  const unsBy = new Map<string, number>();
  for (const u of uns.items) {
    if (u.status === "resolved" || u.status === "ignored") continue;
    unsBy.set(u.pagePath, (unsBy.get(u.pagePath) ?? 0) + 1);
  }
  const driftOpen = new Set(
    drift.items.filter((d) => d.status !== "resolved" && d.status !== "ignored").map((d) => d.pagePath)
  );
  const conflictPages = new Set<string>();
  for (const c of conf.items) {
    if (c.status === "resolved" || c.status === "ignored" || c.status === "accepted-as-tension") continue;
    conflictPages.add(c.sourceA);
    conflictPages.add(c.sourceB);
    if (c.wikiRef) conflictPages.add(c.wikiRef);
  }
  const boardBy = new Map((board?.items ?? []).map((i) => [i.path, i]));

  const prev = await readConfidenceHistory(paths);
  const byPath = new Map((prev?.pages ?? []).map((p) => [p.path, { ...p }]));

  const now = new Date().toISOString();

  for (const rel of wikiRelPaths) {
    let policy;
    let canonicalFm = false;
    try {
      const raw = await fs.readFile(path.join(cfg.root, rel), "utf8");
      const { data } = matter(raw);
      policy = parseWikiEditPolicy(data as Record<string, unknown>);
      const d = data as Record<string, unknown>;
      canonicalFm =
        d.canonical === true || d.canonical === "true" || d.canonical === "yes";
    } catch {
      policy = "open";
    }

    const pr = pqBy.get(rel);
    const er = edBy.get(rel);
    const hrow = hrBy.get(rel);
    const uc = unsBy.get(rel) ?? 0;
    const dr = driftOpen.has(rel);
    const co = conflictPages.has(rel);
    const bitem = boardBy.get(rel);

    let composite =
      (pr?.score0to100 ?? 50) * 0.35 +
      (er?.score0to100 ?? 50) * 0.35 +
      (dr || co ? -12 : 0) +
      Math.max(-20, -uc * 5);

    let canonicalBoost = 0;
    if (policy === "locked" || policy === "manual_review" || canonicalFm) {
      canonicalBoost = policy === "locked" ? 8 : 5;
      composite += canonicalBoost;
    }
    if (bitem?.urgency === "attention") composite -= 6;
    composite = Math.max(0, Math.min(100, Math.round(composite)));

    const snap: ConfidenceSnapshot = {
      at: now,
      composite0to100: composite,
      quality0to100: pr?.score0to100,
      evidence0to100: er?.score0to100,
      openUnsupported: uc,
      driftOpen: dr,
      conflictOpen: co,
      humanBadge: hrow?.badge,
      canonicalBoost,
    };

    const existing = byPath.get(rel) ?? { path: rel, snapshots: [] };
    const last = existing.snapshots[existing.snapshots.length - 1];
    if (
      last &&
      last.composite0to100 === snap.composite0to100 &&
      last.openUnsupported === snap.openUnsupported &&
      last.driftOpen === snap.driftOpen &&
      last.conflictOpen === snap.conflictOpen
    ) {
      byPath.set(rel, existing);
      continue;
    }
    existing.snapshots = [...existing.snapshots, snap].slice(-MAX_SNAPSHOTS_PER_PAGE);
    byPath.set(rel, existing);
  }

  const file: ConfidenceHistoryFile = {
    version: 1,
    updatedAt: now,
    pages: Array.from(byPath.values()).filter((p) => p.snapshots.length > 0),
  };
  await writeConfidenceHistory(paths, file);
  return file;
}

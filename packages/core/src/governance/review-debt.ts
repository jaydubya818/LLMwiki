import fs from "node:fs/promises";
import path from "node:path";
import type { BrainPaths } from "../paths.js";
import { brainPaths } from "../paths.js";
import type { BrainConfig } from "../config.js";
import { readUnsupportedClaims } from "../trust/unsupported-claims.js";
import { readConflicts } from "../trust/conflicts.js";
import { readKnowledgeDrift } from "../trust/knowledge-drift.js";
import { readOpenLoops } from "../trust/open-loops.js";
import { readReviewPriority } from "../trust/review-priority.js";
import { readCanonPromotions } from "./canon-promotions.js";
import { readCanonDriftWatchlist } from "./canon-watchlist.js";
import { readReviewSla } from "./review-sla.js";
import { readCanonicalBoard } from "./canonical-board.js";

export type ReviewDebtLevel = "low" | "moderate" | "high" | "critical";

export interface ReviewDebtContributor {
  label: string;
  count: number;
  weight: number;
  note: string;
}

export interface ReviewDebtHistoryPoint {
  at: string;
  level: ReviewDebtLevel;
  score0to100: number;
}

export interface ReviewDebtFile {
  version: 1;
  updatedAt: string;
  level: ReviewDebtLevel;
  /** Higher ≈ more unresolved review-ish work (advisory, not hours). */
  score0to100: number;
  contributors: ReviewDebtContributor[];
  trendHint: "rising" | "falling" | "stable" | "unknown";
  history: ReviewDebtHistoryPoint[];
}

function levelFromScore(s: number): ReviewDebtLevel {
  if (s < 18) return "low";
  if (s < 35) return "moderate";
  if (s < 55) return "high";
  return "critical";
}

export async function readReviewDebt(paths: BrainPaths): Promise<ReviewDebtFile | null> {
  try {
    const raw = await fs.readFile(paths.reviewDebtJson, "utf8");
    return JSON.parse(raw) as ReviewDebtFile;
  } catch {
    return null;
  }
}

export async function writeReviewDebt(paths: BrainPaths, f: ReviewDebtFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.reviewDebtJson), { recursive: true });
  await fs.writeFile(
    paths.reviewDebtJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

/**
 * Explainable review backlog pressure — heuristics only, not estimated hours.
 */
export async function buildReviewDebtMeter(cfg: BrainConfig): Promise<ReviewDebtFile> {
  const paths = brainPaths(cfg.root);
  const uns = await readUnsupportedClaims(paths);
  const conf = await readConflicts(paths);
  const drift = await readKnowledgeDrift(paths);
  const loops = await readOpenLoops(paths);
  const pri = await readReviewPriority(paths);
  const promos = await readCanonPromotions(paths);
  const watch = await readCanonDriftWatchlist(paths);
  const sla = await readReviewSla(paths);
  const board = await readCanonicalBoard(paths);

  const unsupportedOpen = uns.items.filter((u) => u.status !== "resolved" && u.status !== "ignored").length;
  const conflictsOpen = conf.items.filter(
    (c) => c.status !== "resolved" && c.status !== "ignored" && c.status !== "accepted-as-tension"
  ).length;
  const driftOpen = drift.items.filter((d) => d.status !== "resolved" && d.status !== "ignored").length;
  const loopsReviewy = loops.items.filter(
    (l) =>
      l.status === "open" &&
      (/\b(review|decide|validate|confirm|revisit)\b/i.test(l.title) ||
        /\b(review|decide|validate)\b/i.test(l.excerpt ?? ""))
  ).length;
  const promoPending = promos.items.filter((p) => p.status === "new" || p.status === "reviewing").length;
  const watchRows = watch?.rows?.length ?? 0;
  const slaOverdue = (sla?.items ?? []).filter((i) => i.bucket === "overdue").length;
  const urgentQueue = (pri?.queue ?? []).filter((r) => r.bucket === "urgent").length;

  const staleHumanCanon =
    (board?.items ?? []).filter(
      (i) =>
        (i.policy === "locked" || i.policy === "manual_review" || i.isCanonicalFm) &&
        (i.humanBadge === "review-needed" || i.humanBadge === "outdated-human-review")
    ).length;

  const contributors: ReviewDebtContributor[] = [
    {
      label: "Unsupported claims (open)",
      count: unsupportedOpen,
      weight: 3.2,
      note: "Triage queue — add evidence or soften language.",
    },
    {
      label: "Conflicts (open)",
      count: conflictsOpen,
      weight: 4.5,
      note: "Opposing signals across linked pages.",
    },
    {
      label: "Drift watches (open)",
      count: driftOpen,
      weight: 2.4,
      note: "Wiki likely stale vs raw / practice.",
    },
    {
      label: "Review-priority · urgent rows",
      count: urgentQueue,
      weight: 2.8,
      note: "Top of automated priority queue.",
    },
    {
      label: "Canon promotions pending",
      count: promoPending,
      weight: 3.0,
      note: "Promotion decisions not finished.",
    },
    {
      label: "Canon drift watchlist",
      count: watchRows,
      weight: 2.0,
      note: "High-trust pages with combined risk.",
    },
    {
      label: "SLA overdue hints",
      count: slaOverdue,
      weight: 3.5,
      note: "Items past simple aging thresholds.",
    },
    {
      label: "Open loops (review-shaped)",
      count: loopsReviewy,
      weight: 1.4,
      note: "Scraped TODOs that sound like governance work.",
    },
    {
      label: "Canon-ish pages · stale human review",
      count: staleHumanCanon,
      weight: 2.6,
      note: "Human-reviewed badge out of date after edits.",
    },
  ];

  let score = 0;
  for (const c of contributors) {
    score += Math.min(28, c.count * c.weight);
  }
  score = Math.min(100, Math.round(score));
  const level = levelFromScore(score);

  const prev = await readReviewDebt(paths);
  let trendHint: ReviewDebtFile["trendHint"] = "unknown";
  if (prev?.score0to100 != null) {
    const delta = score - prev.score0to100;
    if (delta > 4) trendHint = "rising";
    else if (delta < -4) trendHint = "falling";
    else trendHint = "stable";
  }

  const history: ReviewDebtHistoryPoint[] = [
    ...(prev?.history ?? []).slice(-29),
    { at: new Date().toISOString(), level, score0to100: score },
  ];

  const file: ReviewDebtFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    level,
    score0to100: score,
    contributors: contributors.filter((c) => c.count > 0).sort((a, b) => b.count * b.weight - a.count * a.weight),
    trendHint,
    history,
  };
  await writeReviewDebt(paths, file);
  return file;
}

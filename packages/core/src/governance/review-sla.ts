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
import fg from "fast-glob";

/** Advisory buckets — thresholds are intentionally simple (days). */
export type ReviewSlaBucket = "fresh" | "aging" | "overdue";

export const SLA_FRESH_DAYS = 7;
export const SLA_AGING_DAYS = 21;

export interface ReviewSlaItem {
  id: string;
  kind: string;
  summary: string;
  path?: string;
  refId?: string;
  openedAt: string;
  /** Last activity timestamp used for aging (may equal openedAt). */
  lastTouchAt: string;
  daysOpen: number;
  bucket: ReviewSlaBucket;
  nextAction: string;
}

export interface ReviewSlaFile {
  version: 1;
  updatedAt: string;
  items: ReviewSlaItem[];
}

export function slaBucketForDays(days: number): ReviewSlaBucket {
  if (days < SLA_FRESH_DAYS) return "fresh";
  if (days < SLA_AGING_DAYS) return "aging";
  return "overdue";
}

function daysSince(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (86400 * 1000)));
}

export async function readReviewSla(paths: BrainPaths): Promise<ReviewSlaFile | null> {
  try {
    const raw = await fs.readFile(paths.reviewSlaJson, "utf8");
    return JSON.parse(raw) as ReviewSlaFile;
  } catch {
    return null;
  }
}

export async function writeReviewSla(paths: BrainPaths, f: ReviewSlaFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.reviewSlaJson), { recursive: true });
  await fs.writeFile(
    paths.reviewSlaJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

export async function buildReviewSlaHints(cfg: BrainConfig): Promise<ReviewSlaFile> {
  const paths = brainPaths(cfg.root);
  const items: ReviewSlaItem[] = [];

  const unsupported = await readUnsupportedClaims(paths);
  for (const u of unsupported.items) {
    if (u.status === "resolved" || u.status === "ignored") continue;
    const touch = u.updatedAt || u.createdAt;
    const d = daysSince(touch);
    items.push({
      id: `unsupported-${u.id}`,
      kind: "unsupported_claim",
      summary: u.excerpt.slice(0, 120) || u.reason,
      path: u.pagePath,
      refId: u.id,
      openedAt: u.createdAt,
      lastTouchAt: touch,
      daysOpen: d,
      bucket: slaBucketForDays(d),
      nextAction: "Open page, add sources or soften claim, or mark resolved in trust tools.",
    });
  }

  const conflicts = await readConflicts(paths);
  for (const c of conflicts.items) {
    if (c.status === "resolved" || c.status === "ignored" || c.status === "accepted-as-tension") continue;
    const touch = c.detectedAt;
    const d = daysSince(touch);
    items.push({
      id: `conflict-${c.id}`,
      kind: "conflict",
      summary: c.topic,
      path: c.wikiRef ?? c.sourceA,
      refId: c.id,
      openedAt: c.detectedAt,
      lastTouchAt: touch,
      daysOpen: d,
      bucket: slaBucketForDays(d),
      nextAction: "Reconcile statuses or document tension; add resolution note when closing.",
    });
  }

  const drift = await readKnowledgeDrift(paths);
  for (const x of drift.items) {
    if (x.status === "resolved" || x.status === "ignored") continue;
    const touch = x.detectedAt;
    const d = daysSince(touch);
    items.push({
      id: `drift-${x.id}`,
      kind: "drift",
      summary: x.summary,
      path: x.pagePath,
      refId: x.id,
      openedAt: x.detectedAt,
      lastTouchAt: touch,
      daysOpen: d,
      bucket: slaBucketForDays(d),
      nextAction: "Refresh wiki from raw sources or mark intentional deferral.",
    });
  }

  const loops = await readOpenLoops(paths);
  for (const l of loops.items) {
    if (l.status !== "open" && l.status !== "in-progress") continue;
    if (l.loopType !== "review-needed" && l.priority !== "high") continue;
    const touch = l.updatedAt || l.createdAt;
    const d = daysSince(touch);
    items.push({
      id: `loop-${l.id}`,
      kind: "open_loop",
      summary: l.title,
      path: l.sourcePath,
      refId: l.id,
      openedAt: l.createdAt,
      lastTouchAt: touch,
      daysOpen: d,
      bucket: slaBucketForDays(d),
      nextAction:
        l.loopType === "review-needed"
          ? "Complete explicit review or rewrite the flagged section."
          : "Close or downgrade priority once addressed.",
    });
  }

  const promos = await readCanonPromotions(paths);
  for (const p of promos.items) {
    if (p.status === "promoted" || p.status === "rejected") continue;
    const touch = p.updatedAt || p.createdAt;
    const d = daysSince(touch);
    items.push({
      id: `canon-promo-${p.id}`,
      kind: "canon_promotion",
      summary: p.promotionSummary.slice(0, 160),
      path: p.proposedTargetCanonicalPage,
      refId: p.id,
      openedAt: p.createdAt,
      lastTouchAt: touch,
      daysOpen: d,
      bucket: slaBucketForDays(d),
      nextAction: "Decide if this belongs in long-term canon; materialize to proposal or defer.",
    });
  }

  const priority = await readReviewPriority(paths);
  const prioUpdated = priority?.updatedAt;
  for (const r of priority?.queue.slice(0, 40) ?? []) {
    if (r.bucket === "when-ready") continue;
    if (items.some((i) => i.path === r.path)) continue;
    let mtimeMs = Date.now();
    try {
      const st = await fs.stat(path.join(cfg.root, r.path));
      mtimeMs = st.mtimeMs;
    } catch {
      /* missing file */
    }
    const daysFile = Math.max(0, Math.floor((Date.now() - mtimeMs) / (86400 * 1000)));
    const openedAt = new Date(mtimeMs).toISOString();
    items.push({
      id: `priority-${r.path}`,
      kind: "review_priority",
      summary: `${r.bucket} priority — ${r.why[0] ?? "review"}`,
      path: r.path,
      openedAt,
      lastTouchAt: prioUpdated ?? openedAt,
      daysOpen: daysFile,
      bucket: slaBucketForDays(daysFile),
      nextAction: "Triage in Review Priority Queue / Review Session.",
    });
  }

  try {
    const props = await fg(
      path.join(paths.proposedWikiUpdatesDir, "*.md").replace(/\\/g, "/"),
      { onlyFiles: true }
    );
    for (const abs of props.slice(0, 24)) {
      const st = await fs.stat(abs);
      const rel = path.relative(cfg.root, abs).split(path.sep).join("/");
      const age = Math.floor((Date.now() - st.mtimeMs) / (86400 * 1000));
      const iso = new Date(st.mtimeMs).toISOString();
      items.push({
        id: `proposed-${rel}`,
        kind: "pending_canonical_update",
        summary: `Proposed wiki update pending review: ${path.basename(rel)}`,
        path: rel,
        openedAt: iso,
        lastTouchAt: iso,
        daysOpen: age,
        bucket: slaBucketForDays(age),
        nextAction: "Open diff review, apply or discard proposal.",
      });
    }
  } catch {
    /* optional */
  }

  items.sort((a, b) => {
    const rank = (x: ReviewSlaBucket) => (x === "overdue" ? 2 : x === "aging" ? 1 : 0);
    if (rank(b.bucket) !== rank(a.bucket)) return rank(b.bucket) - rank(a.bucket);
    return b.daysOpen - a.daysOpen;
  });

  const file: ReviewSlaFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: items.slice(0, 200),
  };
  await writeReviewSla(paths, file);
  return file;
}

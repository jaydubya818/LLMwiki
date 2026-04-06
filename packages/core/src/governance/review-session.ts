import fs from "node:fs/promises";
import path from "node:path";
import type { BrainPaths } from "../paths.js";
import { brainPaths } from "../paths.js";
import type { BrainConfig } from "../config.js";
import { readReviewSla, type ReviewSlaItem } from "./review-sla.js";
import { readCanonPromotions } from "./canon-promotions.js";
import { readCanonDriftWatchlist } from "./canon-watchlist.js";

export type ReviewSessionRefType =
  | "sla_item"
  | "canon_promotion"
  | "watchlist_page"
  | "manual";

export interface ReviewSessionQueueEntry {
  order: number;
  refType: ReviewSessionRefType;
  refId: string;
  title: string;
  detail: string;
  path?: string;
  nextAction: string;
}

export interface ReviewSessionState {
  version: 1;
  updatedAt: string;
  /** Built queue — deterministic ordering. */
  queue: ReviewSessionQueueEntry[];
  /** Index of current item in queue. */
  cursor: number;
  /** Optional markdown path from last completed session summary. */
  lastSummaryPath?: string;
}

export async function readReviewSessionState(paths: BrainPaths): Promise<ReviewSessionState> {
  try {
    const raw = await fs.readFile(paths.reviewSessionStateJson, "utf8");
    return JSON.parse(raw) as ReviewSessionState;
  } catch {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      queue: [],
      cursor: 0,
    };
  }
}

export async function writeReviewSessionState(
  paths: BrainPaths,
  s: ReviewSessionState
): Promise<void> {
  await fs.mkdir(path.dirname(paths.reviewSessionStateJson), { recursive: true });
  await fs.writeFile(
    paths.reviewSessionStateJson,
    JSON.stringify({ ...s, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

function slaToEntry(order: number, s: ReviewSlaItem): ReviewSessionQueueEntry {
  return {
    order,
    refType: "sla_item",
    refId: s.id,
    title: `${s.kind.replace(/_/g, " ")} — ${s.bucket}`,
    detail: s.summary,
    path: s.path,
    nextAction: s.nextAction,
  };
}

export async function rebuildReviewSessionQueue(cfg: BrainConfig): Promise<ReviewSessionState> {
  const paths = brainPaths(cfg.root);
  const sla = (await readReviewSla(paths)) ?? { version: 1, updatedAt: "", items: [] };
  const promos = await readCanonPromotions(paths);
  const entries: ReviewSessionQueueEntry[] = [];
  let order = 0;

  const overdue = sla.items.filter((i) => i.bucket === "overdue");
  const aging = sla.items.filter((i) => i.bucket === "aging");

  for (const x of overdue.slice(0, 25)) entries.push(slaToEntry(order++, x));
  for (const x of aging.slice(0, 15)) entries.push(slaToEntry(order++, x));

  for (const p of promos.items) {
    if (p.status !== "new" && p.status !== "reviewing") continue;
    entries.push({
      order: order++,
      refType: "canon_promotion",
      refId: p.id,
      title: `Canon promotion — ${p.sourceType}`,
      detail: p.promotionSummary,
      path: p.proposedTargetCanonicalPage,
      nextAction: "Approve materialization to proposed wiki update or defer/reject.",
    });
  }

  const watchFile = await readCanonDriftWatchlist(paths);
  for (const w of watchFile?.rows.slice(0, 12) ?? []) {
    entries.push({
      order: order++,
      refType: "watchlist_page",
      refId: w.pagePath,
      title: `Canon drift watch — ${w.severity}`,
      detail: w.reasons.join(" · "),
      path: w.pagePath,
      nextAction: "Snapshot page, resolve drift/conflicts, or mark reviewed in weekly cycle.",
    });
  }

  entries.sort((a, b) => a.order - b.order);
  const normalized = entries.map((e, i) => ({ ...e, order: i }));

  const state: ReviewSessionState = {
    version: 1,
    updatedAt: new Date().toISOString(),
    queue: normalized,
    cursor: 0,
  };
  await writeReviewSessionState(paths, state);
  return state;
}

export async function advanceReviewSessionCursor(
  paths: BrainPaths,
  delta: number
): Promise<ReviewSessionState> {
  const s = await readReviewSessionState(paths);
  s.cursor =
    s.queue.length === 0
      ? 0
      : Math.max(0, Math.min(s.queue.length - 1, s.cursor + delta));
  await writeReviewSessionState(paths, s);
  return s;
}

export async function writeReviewSessionSummaryMd(
  cfg: BrainConfig,
  reviewedIds: string[],
  notes?: string
): Promise<string> {
  const paths = brainPaths(cfg.root);
  const stamp = new Date().toISOString();
  const hhmmss = stamp.slice(11, 19).replace(/:/g, "");
  const lines = [
    "---",
    `title: Review session summary`,
    `kind: review-session`,
    `generated: ${stamp}`,
    "---",
    "",
    "## Items touched this session",
    ...reviewedIds.map((id) => `- ${id}`),
    "",
    notes ? `## Notes\n\n${notes}\n` : "",
  ];
  await fs.mkdir(paths.reviewsDir, { recursive: true });
  const fname = `review-session-${stamp.slice(0, 10)}-${hhmmss}.md`;
  const rel = path.join("outputs", "reviews", fname).split(path.sep).join("/");
  await fs.writeFile(path.join(cfg.root, rel), lines.join("\n"), "utf8");

  const st = await readReviewSessionState(paths);
  st.lastSummaryPath = rel;
  await writeReviewSessionState(paths, st);
  return rel;
}

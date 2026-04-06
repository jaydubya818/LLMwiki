import fs from "node:fs/promises";
import path from "node:path";
import type { BrainPaths } from "../paths.js";
import { brainPaths } from "../paths.js";
import type { BrainConfig } from "../config.js";
import { readCanonPromotions } from "./canon-promotions.js";
import { readCanonicalBoard } from "./canonical-board.js";
import { readEvidenceDensity } from "./evidence-density.js";
import { readHumanReview } from "./human-review.js";
import { readUnsupportedClaims } from "../trust/unsupported-claims.js";
import { readConflicts } from "../trust/conflicts.js";
import { readKnowledgeDrift } from "../trust/knowledge-drift.js";
import { wikiTraceSidecarPath } from "../trust/trace.js";
import { readPageQuality } from "../trust/page-quality.js";
import { readConfidenceHistory, summarizeConfidenceForPage } from "./confidence-history.js";
import { readDecisionImpact } from "./decision-impact.js";
import { readSnapshotBundles } from "./snapshot-bundles.js";

export type ChecklistVerdict = "pass" | "warn" | "fail";

export type CanonAdmissionReadinessSummary = "safe" | "admit_with_warnings" | "blocked";

export interface CanonAdmissionCriterion {
  id: string;
  label: string;
  verdict: ChecklistVerdict;
  note: string;
  /** Strong criteria use `fail` to mark the page as blocked until explicit human override. */
  tier: "advisory" | "strong";
}

export interface CanonAdmissionRecord {
  id: string;
  targetPage: string;
  context: "promotion" | "board" | "manual";
  criteria: CanonAdmissionCriterion[];
  reviewerNote?: string;
  finalDecision?: "ready" | "not_ready" | "deferred";
  updatedAt: string;
  readinessSummary?: CanonAdmissionReadinessSummary;
  /** Latest snapshot bundle id for this page when present. */
  linkedSnapshotId?: string;
  lastReviewedAt?: string;
  lastGovernanceAction?: string;
}

export interface CanonAdmissionFile {
  version: 1;
  updatedAt: string;
  records: CanonAdmissionRecord[];
}

export async function readCanonAdmission(paths: BrainPaths): Promise<CanonAdmissionFile | null> {
  try {
    const raw = await fs.readFile(paths.canonAdmissionJson, "utf8");
    return JSON.parse(raw) as CanonAdmissionFile;
  } catch {
    return null;
  }
}

export async function writeCanonAdmission(paths: BrainPaths, f: CanonAdmissionFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.canonAdmissionJson), { recursive: true });
  await fs.writeFile(
    paths.canonAdmissionJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

async function traceExists(paths: BrainPaths, page: string): Promise<boolean> {
  try {
    await fs.access(wikiTraceSidecarPath(paths, page));
    return true;
  } catch {
    return false;
  }
}

function recordIdFor(page: string, ctx: string): string {
  return `admission-${ctx}-${page.replace(/[^a-z0-9-]/gi, "-").slice(0, 64)}`;
}

const SNAPSHOT_WINDOW_DAYS = 21;

export function summarizeCanonAdmissionReadiness(
  criteria: CanonAdmissionCriterion[]
): CanonAdmissionReadinessSummary {
  const strongFail = criteria.some((c) => c.tier === "strong" && c.verdict === "fail");
  if (strongFail) return "blocked";
  const anyIssue = criteria.some((c) => c.verdict === "fail" || c.verdict === "warn");
  if (anyIssue) return "admit_with_warnings";
  return "safe";
}

export function isCanonAdmissionBlocked(rec: CanonAdmissionRecord): boolean {
  return (rec.readinessSummary ?? summarizeCanonAdmissionReadiness(rec.criteria)) === "blocked";
}

/**
 * Editorial gate checklist for pages on the path to high trust — refreshed; human notes preserved.
 */
export async function buildCanonAdmissionReadiness(cfg: BrainConfig): Promise<CanonAdmissionFile> {
  const paths = brainPaths(cfg.root);
  const promos = await readCanonPromotions(paths);
  const board = await readCanonicalBoard(paths);
  const ed = await readEvidenceDensity(paths);
  const hr = await readHumanReview(paths);
  const uns = await readUnsupportedClaims(paths);
  const conf = await readConflicts(paths);
  const drift = await readKnowledgeDrift(paths);

  const edBy = new Map((ed?.pages ?? []).map((p) => [p.path, p]));
  const hrBy = new Map((hr?.pages ?? []).map((p) => [p.path, p]));
  const unsBy = new Map<string, number>();
  for (const u of uns?.items ?? []) {
    if (u.status === "resolved" || u.status === "ignored") continue;
    unsBy.set(u.pagePath, (unsBy.get(u.pagePath) ?? 0) + 1);
  }
  const conflictPages = new Set<string>();
  for (const c of conf?.items ?? []) {
    if (c.status === "resolved" || c.status === "ignored" || c.status === "accepted-as-tension") continue;
    conflictPages.add(c.sourceA);
    conflictPages.add(c.sourceB);
    if (c.wikiRef) conflictPages.add(c.wikiRef);
  }
  const driftOpen = new Set(
    (drift?.items ?? [])
      .filter((d) => d.status !== "resolved" && d.status !== "ignored")
      .map((d) => d.pagePath)
  );

  const targets = new Map<string, "promotion" | "board">();

  for (const p of promos.items) {
    if (p.status === "rejected") continue;
    const t = p.proposedTargetCanonicalPage.replace(/^\/+/, "");
    if (t.startsWith("wiki/")) targets.set(t, "promotion");
  }
  for (const i of board?.items ?? []) {
    if (i.policy === "locked" || i.policy === "manual_review" || i.isCanonicalFm) {
      targets.set(i.path, targets.has(i.path) ? "promotion" : "board");
    }
  }

  const prev = await readCanonAdmission(paths);
  const prevByKey = new Map((prev?.records ?? []).map((r) => [`${r.targetPage}:${r.context}`, r]));

  const pqFile = await readPageQuality(paths);
  const pqBy = new Map((pqFile?.pages ?? []).map((p) => [p.path, p]));
  const confHist = await readConfidenceHistory(paths);
  const impactFile = await readDecisionImpact(paths);
  const snapBundle = await readSnapshotBundles(paths);

  const now = new Date().toISOString();
  const records: CanonAdmissionRecord[] = [];

  for (const [page, ctx] of targets) {
    const er = edBy.get(page);
    const hrow = hrBy.get(page);
    const uc = unsBy.get(page) ?? 0;
    const hasTrace = await traceExists(paths, page);

    const criteria: CanonAdmissionCriterion[] = [];

    const evBucket = er?.bucket ?? "moderate";
    criteria.push({
      id: "evidence_density",
      label: "Evidence density",
      verdict: evBucket === "high" ? "pass" : evBucket === "moderate" ? "warn" : "fail",
      note: er ? `Bucket ${er.bucket} (${er.score0to100}/100).` : "No evidence row — run refresh.",
      tier: "advisory",
    });

    criteria.push({
      id: "claim_trace",
      label: "Claim trace sidecar",
      verdict: hasTrace ? "pass" : "warn",
      note: hasTrace
        ? "Trace file present under `.brain/trace/`."
        : "No trace sidecar — ingest with tracing or accept weaker provenance.",
      tier: "advisory",
    });

    criteria.push({
      id: "unsupported",
      label: "Unsupported claims",
      verdict: uc === 0 ? "pass" : uc < 3 ? "warn" : "fail",
      note: uc ? `${uc} open unsupported flag(s) on this page.` : "No open unsupported rows.",
      tier: "strong",
    });

    criteria.push({
      id: "conflicts",
      label: "Critical conflicts",
      verdict: conflictPages.has(page) ? "fail" : "pass",
      note: conflictPages.has(page)
        ? "Open conflict references this page — resolve before canon lock."
        : "No open conflict on this page.",
      tier: "strong",
    });

    criteria.push({
      id: "drift",
      label: "Knowledge drift",
      verdict: driftOpen.has(page) ? "warn" : "pass",
      note: driftOpen.has(page)
        ? "Drift queue still open — reconcile or resolve."
        : "No open drift on this page.",
      tier: "advisory",
    });

    const hb = hrow?.badge;
    let humanVerdict: "pass" | "warn" | "fail" = "fail";
    if (hb === "human-reviewed" || hb === "canonical-human-reviewed") humanVerdict = "pass";
    else if (hb === "review-needed" || hb === "outdated-human-review") humanVerdict = "warn";
    criteria.push({
      id: "human_review",
      label: "Human review state",
      verdict: humanVerdict,
      note: hb ? `Badge: ${hb}${hrow?.staleAfterEdit ? " (stale after edit)" : ""}.` : "No human-review row.",
      tier: "advisory",
    });

    const pq = pqBy.get(page);
    criteria.push({
      id: "page_quality",
      label: "Page quality score",
      verdict: !pq ? "warn" : pq.bucket === "high" ? "pass" : pq.bucket === "medium" ? "warn" : "fail",
      note: pq
        ? `${pq.bucket} (${pq.score0to100}/100). ${(pq.reasons ?? []).slice(0, 2).join("; ") || "—"}`
        : "No page-quality row — run operational refresh.",
      tier: "advisory",
    });

    const trendPack = summarizeConfidenceForPage(confHist, page);
    const t = trendPack.trend;
    criteria.push({
      id: "confidence_trend",
      label: "Confidence trend",
      verdict: t === "declining" ? "warn" : "pass",
      note:
        t === "unknown"
          ? "Insufficient confidence history."
          : `Trend: ${t}${
              trendPack.recentDelta != null
                ? ` (recent Δ ${trendPack.recentDelta > 0 ? "+" : ""}${trendPack.recentDelta})`
                : ""
            }.`,
      tier: "advisory",
    });

    const snapsForPage = snapBundle.entries.filter((e) => e.pagePath === page);
    const latestSnap = snapsForPage[0];
    let snapVerdict: ChecklistVerdict = "pass";
    let snapNote = "Snapshot on file within ~21d window.";
    if (!latestSnap) {
      snapVerdict = "warn";
      snapNote = "No snapshot — recommended before canon / lock.";
    } else {
      const ageMs = Date.now() - Date.parse(latestSnap.createdAt);
      if (ageMs > SNAPSHOT_WINDOW_DAYS * 86400000) {
        snapVerdict = "warn";
        snapNote = `Latest snapshot older than ~${SNAPSHOT_WINDOW_DAYS}d.`;
      }
      snapNote += ` \`${latestSnap.artifactRelPath}\``;
    }
    criteria.push({
      id: "recent_snapshot",
      label: "Recent snapshot",
      verdict: snapVerdict,
      note: snapNote,
      tier: "advisory",
    });

    const impactEntry = (impactFile?.entries ?? []).find(
      (e) => e.wikiPath === page || (e.relatedWikiPages ?? []).includes(page)
    );
    criteria.push({
      id: "decision_impact",
      label: "Strategic / decision linkage",
      verdict: impactEntry ? "warn" : "pass",
      note: impactEntry
        ? `Linked in decision-impact: “${impactEntry.title}” — higher scrutiny if admitting to canon.`
        : "No decision-impact row referencing this page.",
      tier: "advisory",
    });

    const promoRow = promos.items.find(
      (p) =>
        p.proposedTargetCanonicalPage.replace(/^\/+/, "") === page &&
        p.status !== "rejected"
    );
    const ratLen = (promoRow?.rationale ?? "").trim().length;
    criteria.push({
      id: "rationale",
      label: "Promotion rationale on file",
      verdict:
        ctx !== "promotion"
          ? "pass"
          : ratLen >= 40
            ? "pass"
            : ratLen > 0
              ? "warn"
              : "fail",
      note:
        ctx === "promotion"
          ? ratLen
            ? `Rationale length ~${ratLen} chars.`
            : "Add rationale on canon promotion record."
          : "N/A for board-only row.",
      tier: "strong",
    });

    const key = `${page}:${ctx}`;
    const old = prevByKey.get(key);
    const readinessSummary = summarizeCanonAdmissionReadiness(criteria);
    const rec: CanonAdmissionRecord = {
      id: old?.id ?? recordIdFor(page, ctx),
      targetPage: page,
      context: ctx,
      criteria,
      reviewerNote: old?.reviewerNote,
      finalDecision: old?.finalDecision,
      updatedAt: now,
      readinessSummary,
      linkedSnapshotId: latestSnap?.id,
      lastReviewedAt: old?.lastReviewedAt,
      lastGovernanceAction: old?.lastGovernanceAction,
    };
    records.push(rec);
  }

  records.sort((a, b) => a.targetPage.localeCompare(b.targetPage));
  const file: CanonAdmissionFile = { version: 1, updatedAt: now, records };
  await writeCanonAdmission(paths, file);
  return file;
}

export async function patchCanonAdmissionRecord(
  paths: BrainPaths,
  id: string,
  patch: Partial<
    Pick<
      CanonAdmissionRecord,
      | "reviewerNote"
      | "finalDecision"
      | "linkedSnapshotId"
      | "lastReviewedAt"
      | "lastGovernanceAction"
    >
  >
): Promise<CanonAdmissionRecord | null> {
  const f =
    (await readCanonAdmission(paths)) ??
    ({ version: 1, updatedAt: new Date().toISOString(), records: [] } as CanonAdmissionFile);
  const idx = f.records.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  f.records[idx] = { ...f.records[idx]!, ...patch, updatedAt: new Date().toISOString() };
  await writeCanonAdmission(paths, f);
  return f.records[idx]!;
}

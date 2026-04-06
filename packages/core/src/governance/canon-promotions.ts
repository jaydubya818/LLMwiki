import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { v4 as uuid } from "uuid";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";
import { writeProposedWikiUpdate } from "../trust/proposed-wiki.js";
import { readGovernanceSettings } from "./governance-settings.js";
import { ensureRecentSnapshotForPage } from "./governance-capture.js";

export type CanonPromotionSourceType =
  | "promotion_inbox"
  | "output"
  | "wiki_section"
  | "comparative_synthesis"
  | "decision_memo"
  | "review_packet_finding"
  | "other";

export type CanonPromotionStatus =
  | "new"
  | "reviewing"
  | "approved"
  | "rejected"
  | "deferred"
  | "promoted";

export interface CanonPromotionRecord {
  id: string;
  sourceArtifactPath: string;
  sourceType: CanonPromotionSourceType;
  proposedTargetCanonicalPage: string;
  proposedTargetSection?: string;
  rationale: string;
  promotionSummary: string;
  supportingTraceRefs?: string[];
  createdAt: string;
  updatedAt: string;
  status: CanonPromotionStatus;
  reviewerNote?: string;
  /** Repo-relative path under `.brain/proposed-wiki-updates/` after materialization. */
  linkedProposalPath?: string;
  linkedPromotionInboxId?: string;
  /** Snapshot bundle id captured around materialization / guard rail. */
  linkedSnapshotId?: string;
}

export interface CanonPromotionsFile {
  version: 1;
  updatedAt: string;
  items: CanonPromotionRecord[];
}

function emptyFile(): CanonPromotionsFile {
  return { version: 1, updatedAt: new Date().toISOString(), items: [] };
}

export async function readCanonPromotions(paths: BrainPaths): Promise<CanonPromotionsFile> {
  try {
    const raw = await fs.readFile(paths.canonPromotionsJson, "utf8");
    const j = JSON.parse(raw) as CanonPromotionsFile;
    if (!j.items) j.items = [];
    return j;
  } catch {
    return emptyFile();
  }
}

export async function writeCanonPromotions(paths: BrainPaths, f: CanonPromotionsFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.canonPromotionsJson), { recursive: true });
  await fs.writeFile(
    paths.canonPromotionsJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

export async function addCanonPromotion(
  paths: BrainPaths,
  partial: Omit<CanonPromotionRecord, "id" | "createdAt" | "updatedAt" | "status"> & {
    id?: string;
    status?: CanonPromotionStatus;
  }
): Promise<CanonPromotionRecord> {
  const f = await readCanonPromotions(paths);
  const now = new Date().toISOString();
  const rec: CanonPromotionRecord = {
    id: partial.id ?? uuid(),
    sourceArtifactPath: partial.sourceArtifactPath,
    sourceType: partial.sourceType,
    proposedTargetCanonicalPage: partial.proposedTargetCanonicalPage,
    proposedTargetSection: partial.proposedTargetSection,
    rationale: partial.rationale,
    promotionSummary: partial.promotionSummary,
    supportingTraceRefs: partial.supportingTraceRefs,
    createdAt: now,
    updatedAt: now,
    status: partial.status ?? "new",
    reviewerNote: partial.reviewerNote,
    linkedProposalPath: partial.linkedProposalPath,
    linkedPromotionInboxId: partial.linkedPromotionInboxId,
    linkedSnapshotId: partial.linkedSnapshotId,
  };
  f.items.push(rec);
  await writeCanonPromotions(paths, f);
  return rec;
}

export async function updateCanonPromotion(
  paths: BrainPaths,
  id: string,
  patch: Partial<Omit<CanonPromotionRecord, "id" | "createdAt">>
): Promise<CanonPromotionRecord | null> {
  const f = await readCanonPromotions(paths);
  const idx = f.items.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  f.items[idx] = {
    ...f.items[idx]!,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await writeCanonPromotions(paths, f);
  return f.items[idx]!;
}

/**
 * Writes a **proposed** wiki update (never overwrites the live page). Review via Diff + git.
 */
export async function materializeCanonPromotionToProposal(
  cfg: BrainConfig,
  id: string
): Promise<{ proposedRel: string; snapshotId?: string; snapshotCreated?: boolean }> {
  const paths = brainPaths(cfg.root);
  const f = await readCanonPromotions(paths);
  const rec = f.items.find((x) => x.id === id);
  if (!rec) throw new Error(`Canon promotion not found: ${id}`);
  if (rec.status === "rejected") throw new Error("Promotion is rejected — un-reject before materializing.");

  const targetRelEarly = rec.proposedTargetCanonicalPage.replace(/^\//, "");
  const settings = await readGovernanceSettings(paths);
  const snap = await ensureRecentSnapshotForPage(
    cfg,
    targetRelEarly,
    settings,
    `pre-materialize promotion ${rec.id}`
  );
  if (!snap.ok) {
    throw new Error(`SNAPSHOT_REQUIRED: ${snap.message}`);
  }
  rec.linkedSnapshotId = snap.snapshotId || rec.linkedSnapshotId;

  const srcAbs = path.join(cfg.root, rec.sourceArtifactPath);
  const rawSrc = await fs.readFile(srcAbs, "utf8");
  const { content: body } = matter(rawSrc);

  const targetRel = rec.proposedTargetCanonicalPage.replace(/^\//, "");
  const targetAbs = path.join(cfg.root, targetRel);
  const stamp = new Date().toISOString();

  const sectionHint = rec.proposedTargetSection
    ? `Target section: **${rec.proposedTargetSection}** (review placement manually).`
    : "";

  const promoBlock = [
    "",
    `## Canon promotion (proposed ${stamp.slice(0, 10)})`,
    `_Governance id \`${rec.id}\` · source \`${rec.sourceArtifactPath}\`_`,
    `_Summary: ${rec.promotionSummary}_`,
    sectionHint,
    "",
    body.trim(),
    "",
  ].join("\n");

  let merged: string;
  try {
    const existing = await fs.readFile(targetAbs, "utf8");
    const { content, data } = matter(existing);
    const fm = { ...(data as Record<string, unknown>) };
    const promos = Array.isArray(fm.promotions_from)
      ? ([...(fm.promotions_from as string[])] as string[])
      : [];
    if (!promos.includes(rec.sourceArtifactPath)) promos.push(rec.sourceArtifactPath);
    fm.promotions_from = promos;
    fm.last_updated = stamp.slice(0, 10);
    merged = matter.stringify(`${content.trim()}${promoBlock}`, fm);
  } catch {
    merged = matter.stringify(promoBlock.trim(), {
      title: path.basename(targetRel, ".md"),
      type: "topic",
      domain: targetRel.split("/")[1] ?? "topics",
      status: "active",
      last_updated: stamp.slice(0, 10),
      sources: [rec.sourceArtifactPath],
      promotions_from: [rec.sourceArtifactPath],
      wiki_edit_policy: "manual_review",
      canon_promotion_id: rec.id,
    });
  }

  const proposedRel = await writeProposedWikiUpdate(paths, merged, {
    targetWikiRel: targetRel,
    reason: "canonical",
    rawSourceRel: rec.sourceArtifactPath,
    policy: "canon_promotion",
    planSummary: `${rec.id}: ${rec.promotionSummary.slice(0, 240)}`,
  });

  rec.status = "promoted";
  rec.linkedProposalPath = proposedRel;
  rec.updatedAt = stamp;
  await writeCanonPromotions(paths, f);
  return { proposedRel, snapshotId: snap.snapshotId, snapshotCreated: snap.created };
}

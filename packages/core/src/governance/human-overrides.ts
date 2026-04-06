import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";
import type { BrainPaths } from "../paths.js";

export type HumanOverrideType =
  | "reject_synthesis"
  | "conflict_resolution"
  | "manual_canon_edit"
  | "reject_canon_promotion"
  | "curated_section"
  | "priority_override"
  | "merge_supersession_override"
  | "canon_admission_override"
  | "drift_resolution"
  | "unsupported_claim_review"
  | "decision_sunset_review"
  | "canon_council_action"
  | "review_session_note"
  | "other";

export type GovernanceSourceWorkflow =
  | "canon_promotion"
  | "canon_admission"
  | "conflict"
  | "drift"
  | "unsupported_claim"
  | "decision_sunset"
  | "canon_council"
  | "review_session"
  | "evidence_alert"
  | "review_priority"
  | "snapshot_guard"
  | "other";

export interface HumanOverrideRecord {
  id: string;
  relatedPath: string;
  overrideType: HumanOverrideType;
  previousSuggestion?: string;
  humanDecision: string;
  rationale: string;
  createdAt: string;
  linkedResolutionId?: string;
  linkedDecisionPath?: string;
  /** Dashboard / refresh pass — not a long-form manual journal entry. */
  autoCaptured?: boolean;
  sourceWorkflow?: GovernanceSourceWorkflow;
  relatedItemType?: string;
  relatedItemId?: string;
  actionTaken?: string;
  linkedSnapshotId?: string;
  linkedCouncilMinutesPath?: string;
}

export interface HumanOverridesFile {
  version: 1;
  updatedAt: string;
  items: HumanOverrideRecord[];
}

export async function readHumanOverrides(paths: BrainPaths): Promise<HumanOverridesFile> {
  try {
    const raw = await fs.readFile(paths.humanOverridesJson, "utf8");
    const j = JSON.parse(raw) as HumanOverridesFile;
    if (!j.items) j.items = [];
    return j;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), items: [] };
  }
}

export async function writeHumanOverrides(paths: BrainPaths, f: HumanOverridesFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.humanOverridesJson), { recursive: true });
  await fs.writeFile(
    paths.humanOverridesJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

export async function recordHumanOverride(
  paths: BrainPaths,
  input: Omit<HumanOverrideRecord, "id" | "createdAt"> & { id?: string }
): Promise<HumanOverrideRecord> {
  const f = await readHumanOverrides(paths);
  const rec: HumanOverrideRecord = {
    id: input.id ?? uuid(),
    relatedPath: input.relatedPath,
    overrideType: input.overrideType,
    previousSuggestion: input.previousSuggestion,
    humanDecision: input.humanDecision,
    rationale: input.rationale,
    createdAt: new Date().toISOString(),
    linkedResolutionId: input.linkedResolutionId,
    linkedDecisionPath: input.linkedDecisionPath,
    autoCaptured: input.autoCaptured,
    sourceWorkflow: input.sourceWorkflow,
    relatedItemType: input.relatedItemType,
    relatedItemId: input.relatedItemId,
    actionTaken: input.actionTaken,
    linkedSnapshotId: input.linkedSnapshotId,
    linkedCouncilMinutesPath: input.linkedCouncilMinutesPath,
  };
  f.items.unshift(rec);
  f.items = f.items.slice(0, 500);
  await writeHumanOverrides(paths, f);
  return rec;
}

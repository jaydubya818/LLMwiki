import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";
import type { GovernanceSettings } from "./governance-settings.js";
import { readGovernanceSettings } from "./governance-settings.js";
import {
  readHumanOverrides,
  recordHumanOverride,
  writeHumanOverrides,
  type GovernanceSourceWorkflow,
  type HumanOverrideRecord,
  type HumanOverrideType,
} from "./human-overrides.js";
import { readSnapshotBundles, recordPageSnapshot } from "./snapshot-bundles.js";

export interface GovernanceActionLogEntry {
  id: string;
  at: string;
  workflow: GovernanceSourceWorkflow;
  action: string;
  refType?: string;
  refId?: string;
  relatedPaths: string[];
  rationale?: string;
  overrideId?: string;
  resolutionId?: string;
  snapshotId?: string;
  minutesArtifact?: string;
}

export interface GovernanceActionLogFile {
  version: 1;
  updatedAt: string;
  entries: GovernanceActionLogEntry[];
}

export async function readGovernanceActionLog(paths: BrainPaths): Promise<GovernanceActionLogFile> {
  try {
    const raw = await fs.readFile(paths.governanceActionLogJson, "utf8");
    const j = JSON.parse(raw) as GovernanceActionLogFile;
    if (!j.entries) j.entries = [];
    return j;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
  }
}

export async function appendGovernanceActionLog(
  paths: BrainPaths,
  entry: Omit<GovernanceActionLogEntry, "id" | "at">
): Promise<GovernanceActionLogEntry> {
  const f = await readGovernanceActionLog(paths);
  const rec: GovernanceActionLogEntry = {
    ...entry,
    id: uuid(),
    at: new Date().toISOString(),
  };
  f.entries.unshift(rec);
  f.entries = f.entries.slice(0, 1500);
  await fs.mkdir(path.dirname(paths.governanceActionLogJson), { recursive: true });
  await fs.writeFile(
    paths.governanceActionLogJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
  return rec;
}

export interface CouncilMinutesAppend {
  title: string;
  lines: string[];
  followUp?: string;
}

/** Appends a dated section to the rolling council minutes log (Markdown). */
export async function appendCouncilMinutesRolling(
  cfg: BrainConfig,
  section: CouncilMinutesAppend
): Promise<string> {
  const paths = brainPaths(cfg.root);
  await fs.mkdir(path.dirname(paths.councilMinutesLogMd), { recursive: true });
  const stamp = new Date().toISOString();
  const head = `## ${stamp.slice(0, 16).replace("T", " ")} — ${section.title}\n\n`;
  const body = [...section.lines, section.followUp ? `\n_Follow-up:_ ${section.followUp}` : ""].join("\n");
  const block = `${head}${body}\n\n---\n\n`;
  try {
    const prev = await fs.readFile(paths.councilMinutesLogMd, "utf8");
    await fs.writeFile(paths.councilMinutesLogMd, block + prev, "utf8");
  } catch {
    await fs.writeFile(
      paths.councilMinutesLogMd,
      `# Canon council minutes (rolling)\n\n${block}`,
      "utf8"
    );
  }
  return path.relative(cfg.root, paths.councilMinutesLogMd).split(path.sep).join("/");
}

/** One-shot session file under outputs/reviews — for explicit “write minutes” actions. */
export async function writeCouncilMinutesSessionFile(
  cfg: BrainConfig,
  section: CouncilMinutesAppend
): Promise<string> {
  const paths = brainPaths(cfg.root);
  await fs.mkdir(paths.reviewsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fname = `canon-council-minutes-${stamp}.md`;
  const rel = path.join("outputs", "reviews", fname).split(path.sep).join("/");
  const md = [
    "---",
    `title: Canon council minutes`,
    `kind: canon-council-minutes`,
    `generated: ${new Date().toISOString()}`,
    "---",
    "",
    `# ${section.title}`,
    "",
    ...section.lines,
    section.followUp ? `\n**Follow-up:** ${section.followUp}\n` : "",
    "",
  ].join("\n");
  await fs.writeFile(path.join(cfg.root, rel), md, "utf8");
  return rel;
}

/** Preflight: whether `captureGovernanceIntent` would refuse without a rationale string. */
export function inferGovernanceIntentNeedsRationale(
  settings: GovernanceSettings,
  input: {
    rationale?: string;
    sourceWorkflow: GovernanceSourceWorkflow;
    relatedPath: string;
    overrideType: HumanOverrideType;
    canonAdmissionOverride?: boolean;
  }
): boolean {
  if (!settings.requireRationaleForCanonOverrides) return false;
  const high =
    input.canonAdmissionOverride ||
    isHighSignalGovernanceContext({
      sourceWorkflow: input.sourceWorkflow,
      relatedPath: input.relatedPath,
      overrideType: input.overrideType,
      canonAdmissionOverride: input.canonAdmissionOverride,
    });
  return high && !String(input.rationale ?? "").trim();
}

export function isHighSignalGovernanceContext(params: {
  sourceWorkflow: GovernanceSourceWorkflow;
  relatedPath: string;
  overrideType: HumanOverrideType;
  /** True when canon admission checklist is blocked but human marks ready. */
  canonAdmissionOverride?: boolean;
}): boolean {
  if (params.canonAdmissionOverride) return true;
  const p = params.relatedPath.replace(/^\//, "");
  if (p.includes("wiki/decisions/")) return true;
  if (
    params.overrideType === "canon_admission_override" ||
    params.overrideType === "reject_canon_promotion"
  ) {
    return true;
  }
  if (params.sourceWorkflow === "decision_sunset" && params.overrideType === "decision_sunset_review") {
    return true;
  }
  return false;
}

export async function ensureRecentSnapshotForPage(
  cfg: BrainConfig,
  pagePath: string,
  settings: GovernanceSettings,
  reason?: string
): Promise<
  | { ok: true; snapshotId: string; created: boolean }
  | { ok: false; code: "SNAPSHOT_REQUIRED"; message: string }
> {
  const paths = brainPaths(cfg.root);
  const norm = pagePath.replace(/^\//, "");
  const bundle = await readSnapshotBundles(paths);
  const maxMs = Math.max(1, settings.snapshotMaxAgeDaysForCanon) * 86400000;
  const forPage = bundle.entries.filter((e) => e.pagePath === norm);
  const latest = forPage[0];
  if (latest && Date.now() - Date.parse(latest.createdAt) <= maxMs) {
    return { ok: true, snapshotId: latest.id, created: false };
  }

  if (!settings.requireSnapshotBeforeCanon) {
    return { ok: true, snapshotId: latest?.id ?? "", created: false };
  }

  if (settings.autoSnapshotWhenMissingBeforeCanon) {
    const r = await recordPageSnapshot(cfg, norm, reason ?? "pre-canon snapshot guard", undefined);
    return { ok: true, snapshotId: r.id, created: true };
  }

  return {
    ok: false,
    code: "SNAPSHOT_REQUIRED",
    message: `No snapshot within ${settings.snapshotMaxAgeDaysForCanon}d for ${norm}. Create one from the page or enable autoSnapshotWhenMissingBeforeCanon in .brain/governance-settings.json.`,
  };
}

export interface CaptureGovernanceIntentInput {
  relatedPath: string;
  overrideType: HumanOverrideType;
  sourceWorkflow: GovernanceSourceWorkflow;
  actionTaken: string;
  finalHumanDecision: string;
  previousSuggestion?: string;
  rationale?: string;
  autoCaptured?: boolean;
  relatedItemType?: string;
  relatedItemId?: string;
  linkedResolutionId?: string;
  linkedDecisionPath?: string;
  linkedSnapshotId?: string;
  canonAdmissionOverride?: boolean;
  appendCouncilMinutes?: CouncilMinutesAppend;
  /** Write `appendCouncilMinutes` as a timestamped session file instead of the rolling log. */
  minutesAsSessionFile?: boolean;
  skipCapture?: boolean;
  skipActionLog?: boolean;
}

export interface CaptureGovernanceIntentResult {
  override?: HumanOverrideRecord;
  needsRationale?: boolean;
  actionLog?: GovernanceActionLogEntry;
  minutesPath?: string;
}

export async function captureGovernanceIntent(
  cfg: BrainConfig,
  input: CaptureGovernanceIntentInput,
  settings?: GovernanceSettings
): Promise<CaptureGovernanceIntentResult> {
  const paths = brainPaths(cfg.root);
  const s = settings ?? (await readGovernanceSettings(paths));

  if (input.skipCapture || !s.autoCaptureOverrides) {
    return {};
  }

  const high =
    input.canonAdmissionOverride ||
    isHighSignalGovernanceContext({
      sourceWorkflow: input.sourceWorkflow,
      relatedPath: input.relatedPath,
      overrideType: input.overrideType,
      canonAdmissionOverride: input.canonAdmissionOverride,
    });

  if (s.requireRationaleForCanonOverrides && high && !String(input.rationale ?? "").trim()) {
    return { needsRationale: true };
  }

  const rationale =
    (input.rationale?.trim() ||
      (input.autoCaptured ? "(auto-captured — no extra note)" : "")) ||
    "—";

  const ov = await recordHumanOverride(paths, {
    relatedPath: input.relatedPath.replace(/^\//, ""),
    overrideType: input.overrideType,
    previousSuggestion: input.previousSuggestion,
    humanDecision: input.finalHumanDecision,
    rationale,
    linkedResolutionId: input.linkedResolutionId,
    linkedDecisionPath: input.linkedDecisionPath,
    autoCaptured: input.autoCaptured !== false,
    sourceWorkflow: input.sourceWorkflow,
    relatedItemType: input.relatedItemType,
    relatedItemId: input.relatedItemId,
    actionTaken: input.actionTaken,
    linkedSnapshotId: input.linkedSnapshotId,
  });

  let actionLog: GovernanceActionLogEntry | undefined;
  if (!input.skipActionLog) {
    actionLog = await appendGovernanceActionLog(paths, {
      workflow: input.sourceWorkflow,
      action: input.actionTaken,
      refType: input.relatedItemType,
      refId: input.relatedItemId,
      relatedPaths: [input.relatedPath.replace(/^\//, "")],
      rationale: input.rationale?.trim() || undefined,
      overrideId: ov.id,
      resolutionId: input.linkedResolutionId,
      snapshotId: input.linkedSnapshotId,
    });
  }

  let minutesPath: string | undefined;

  if (input.appendCouncilMinutes) {
    if (input.minutesAsSessionFile || s.councilMinutesMode === "session") {
      minutesPath = await writeCouncilMinutesSessionFile(cfg, input.appendCouncilMinutes);
    } else {
      minutesPath = await appendCouncilMinutesRolling(cfg, input.appendCouncilMinutes);
    }
  } else if (s.autoGenerateCouncilMinutes && high) {
    minutesPath = await appendCouncilMinutesRolling(cfg, {
      title: input.actionTaken,
      lines: [
        `- Path: \`${input.relatedPath}\``,
        `- Decision: ${input.finalHumanDecision}`,
        input.previousSuggestion ? `- Prior signal: ${input.previousSuggestion.slice(0, 240)}` : "",
      ].filter(Boolean),
    });
  }

  if (minutesPath && ov) {
    const all = await readHumanOverrides(paths);
    const idx = all.items.findIndex((x) => x.id === ov.id);
    if (idx >= 0) {
      all.items[idx] = { ...all.items[idx]!, linkedCouncilMinutesPath: minutesPath };
      await writeHumanOverrides(paths, all);
    }
  }

  return { override: ov, actionLog, minutesPath };
}

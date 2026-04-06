import fs from "node:fs/promises";
import type { BrainPaths } from "../paths.js";

export interface GovernanceSettings {
  version: 1;
  /** When true, dashboard actions record `.brain/human-overrides.json` entries automatically when intent is clear. */
  autoCaptureOverrides: boolean;
  /** When true, admitting canon / promotion approve with failing **strong** gates requires a non-empty rationale in the API body. */
  requireRationaleForCanonOverrides: boolean;
  /** When true, materialize/promotion paths warn or block without a recent snapshot (see snapshotMaxAgeDaysForCanon). */
  requireSnapshotBeforeCanon: boolean;
  /** If requireSnapshotBeforeCanon and no recent snapshot, auto-create one instead of blocking (when safe). */
  autoSnapshotWhenMissingBeforeCanon: boolean;
  /** Max age in days for a snapshot to count as “recent” for canon transitions. */
  snapshotMaxAgeDaysForCanon: number;
  /** When true, eligible governance actions also append council minutes (rolling log or session — see councilMinutesMode). */
  autoGenerateCouncilMinutes: boolean;
  /** `rolling` = append to outputs/reviews/canon-council-minutes-log.md; `session` = only via explicit “write minutes file” action. */
  councilMinutesMode: "rolling" | "session";
  /**
   * When false, `brain doctor` skips the canon-guard summary; `brain canon-guard --hook` exits 0 immediately.
   * Manual `brain canon-guard` (without `--hook`) still runs.
   */
  canonGuardEnabled: boolean;
  /**
   * Pre-commit hook: when true, high-attention findings only print a warning and exit 0.
   * When false, hook exits 1 on high-attention (strict) — use only if you want commits blocked.
   */
  canonGuardHookWarnOnly: boolean;
  /**
   * When true, missing recent snapshots on high-trust pages with content edits upgrade severity
   * (warn → high_attention) in canon-guard reports.
   */
  canonGuardRequireRecentSnapshot: boolean;
  /**
   * When true, trust-field-only changes without a recent governance trail bump to high_attention more aggressively.
   */
  canonGuardStrictTrustDelta: boolean;
  /** Informational: set true after `brain install-hooks --pre-commit` or `--all` (not read by hook logic). */
  installGitHooks: boolean;
  /** When false, `brain canon-guard --hook --push` exits 0 immediately (pre-push hook still installed). */
  enablePrePushCanonGuard: boolean;
  /**
   * Pre-push hook: warn-only on HIGH ATTENTION when true (default). When false, push is blocked like strict pre-commit.
   */
  canonGuardPrePushWarnOnly: boolean;
  /** Informational: set true after `brain install-hooks --pre-push` or `--all`. */
  installPrePushHook: boolean;
  /** Repo-relative path prefixes to skip for **open** pages only (high-trust / trust deltas always scanned). */
  canonGuardIgnorePrefixes: string[];
  /** Exact repo-relative paths (.md) to skip under the same rules as prefixes. */
  canonGuardIgnorePaths: string[];
}

const DEFAULTS: GovernanceSettings = {
  version: 1,
  autoCaptureOverrides: true,
  requireRationaleForCanonOverrides: false,
  requireSnapshotBeforeCanon: true,
  autoSnapshotWhenMissingBeforeCanon: true,
  snapshotMaxAgeDaysForCanon: 21,
  autoGenerateCouncilMinutes: false,
  councilMinutesMode: "rolling",
  canonGuardEnabled: true,
  canonGuardHookWarnOnly: true,
  canonGuardRequireRecentSnapshot: false,
  canonGuardStrictTrustDelta: false,
  installGitHooks: false,
  enablePrePushCanonGuard: true,
  canonGuardPrePushWarnOnly: true,
  installPrePushHook: false,
  canonGuardIgnorePrefixes: [],
  canonGuardIgnorePaths: [],
};

export async function readGovernanceSettings(paths: BrainPaths): Promise<GovernanceSettings> {
  try {
    const raw = await fs.readFile(paths.governanceSettingsJson, "utf8");
    const j = JSON.parse(raw) as Partial<GovernanceSettings>;
    return { ...DEFAULTS, ...j, version: 1 };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function writeGovernanceSettings(paths: BrainPaths, s: GovernanceSettings): Promise<void> {
  await fs.mkdir(paths.brain, { recursive: true });
  await fs.writeFile(
    paths.governanceSettingsJson,
    JSON.stringify({ ...DEFAULTS, ...s, version: 1 }, null, 2),
    "utf8"
  );
}

export async function patchGovernanceSettings(
  paths: BrainPaths,
  patch: Partial<Omit<GovernanceSettings, "version">>
): Promise<GovernanceSettings> {
  const cur = await readGovernanceSettings(paths);
  const next = { ...cur, ...patch, version: 1 as const };
  await writeGovernanceSettings(paths, next);
  return next;
}

import type { BrainPaths } from "../paths.js";
import { appendGovernanceActionLog, readGovernanceActionLog, type GovernanceActionLogEntry } from "./governance-capture.js";
import type { ExecutiveAction, ExecutiveTrustSummary } from "./executive-trust-layer.js";

/** Logged on voluntary "I did this" from executive UI / CLI. */
export const EXECUTIVE_TRUST_WORKFLOW = "executive_trust" as const;

export const EXECUTIVE_ACTION_LOG_VERB = "executive_action_done";

/** refType on log entry — refId holds the actionKey. */
export const EXECUTIVE_ACTION_REF_TYPE = "executive_action_key";

export const DEFAULT_EXECUTIVE_TELEMETRY_DAYS = 14;

function normalizeRel(p: string): string {
  return p.replace(/^\/+/, "");
}

function entryMatchesAction(
  e: GovernanceActionLogEntry,
  action: ExecutiveAction,
  windowStart: number
): boolean {
  if (e.workflow !== EXECUTIVE_TRUST_WORKFLOW) return false;
  if (e.action !== EXECUTIVE_ACTION_LOG_VERB) return false;
  if (e.refType !== EXECUTIVE_ACTION_REF_TYPE) return false;
  if (!e.refId || e.refId !== action.actionKey) return false;
  const t = Date.parse(e.at);
  if (Number.isNaN(t) || t < windowStart) return false;
  if (action.targetPath) {
    const norm = normalizeRel(action.targetPath);
    const paths = (e.relatedPaths ?? []).map(normalizeRel);
    if (!paths.some((p) => p === norm || p.endsWith(norm) || norm.endsWith(p))) return false;
  }
  return true;
}

/** Latest completion timestamp for this action within the window, if any. */
export function lastExecutiveActionCompletionAt(
  entries: GovernanceActionLogEntry[],
  action: ExecutiveAction,
  windowDays: number
): string | undefined {
  if (!action.actionKey) return undefined;
  const windowStart = Date.now() - windowDays * 86_400_000;
  let best = 0;
  let bestAt: string | undefined;
  for (const e of entries) {
    if (!entryMatchesAction(e, action, windowStart)) continue;
    const t = Date.parse(e.at);
    if (!Number.isNaN(t) && t >= best) {
      best = t;
      bestAt = e.at;
    }
  }
  return bestAt;
}

/** Append a lightweight row to `.brain/governance-action-log.json` (no human-override row). */
export async function recordExecutiveTrustActionDone(
  paths: BrainPaths,
  input: { actionKey: string; targetPath?: string; rationale?: string }
): Promise<GovernanceActionLogEntry> {
  const related = input.targetPath ? [normalizeRel(input.targetPath)] : [];
  return appendGovernanceActionLog(paths, {
    workflow: EXECUTIVE_TRUST_WORKFLOW,
    action: EXECUTIVE_ACTION_LOG_VERB,
    refType: EXECUTIVE_ACTION_REF_TYPE,
    refId: input.actionKey,
    relatedPaths: related,
    rationale: input.rationale?.trim() || undefined,
  });
}

function inferActionKeyFromHref(href: string): string | undefined {
  if (href === "/canon-fragility") return "nav_canon_fragility";
  if (href === "/executive-trust") return "nav_executive_trust";
  if (href === "/review-session") return "nav_review_session";
  if (href === "/canon-council") return "nav_canon_council";
  if (href === "/review-queue") return "nav_review_queue";
  if (href === "/decision-sunset") return "nav_decision_sunset";
  if (href === "/drift") return "nav_drift";
  if (href === "/conflicts") return "nav_conflicts";
  const m = href.match(/^\/wiki\?path=(.+)$/);
  if (m) {
    try {
      return `review_wiki:${decodeURIComponent(m[1])}`;
    } catch {
      return `review_wiki:${m[1]}`;
    }
  }
  return undefined;
}

/** Merge completion timestamps from the governance log into a summary (idempotent). */
export async function applyExecutiveActionTelemetryToSummary(
  paths: BrainPaths,
  summary: ExecutiveTrustSummary,
  options: { windowDays?: number } = {}
): Promise<ExecutiveTrustSummary> {
  const windowDays = options.windowDays ?? DEFAULT_EXECUTIVE_TELEMETRY_DAYS;
  const log = await readGovernanceActionLog(paths);
  const entries = log.entries ?? [];
  let addressed = 0;
  const topActions = summary.topActions.map((a) => {
    const actionKey = a.actionKey ?? inferActionKeyFromHref(a.href);
    const key = actionKey ?? "";
    const withKey: ExecutiveAction = {
      ...a,
      actionKey: key || "unknown",
    };
    const lastMarkedDoneAt = key ? lastExecutiveActionCompletionAt(entries, withKey, windowDays) : undefined;
    if (lastMarkedDoneAt) addressed += 1;
    return {
      ...a,
      ...(actionKey ? { actionKey } : {}),
      lastMarkedDoneAt,
    };
  });
  const suggested = topActions.filter((a) => !!a.actionKey && a.actionKey !== "unknown").length;
  return {
    ...summary,
    topActions,
    actionTelemetry: {
      windowDays,
      suggestedCount: suggested,
      addressedInWindow: addressed,
    },
  };
}
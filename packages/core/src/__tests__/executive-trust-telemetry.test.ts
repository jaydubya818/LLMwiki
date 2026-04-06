import { describe, it, expect } from "vitest";
import {
  lastExecutiveActionCompletionAt,
  EXECUTIVE_TRUST_WORKFLOW,
  EXECUTIVE_ACTION_LOG_VERB,
  EXECUTIVE_ACTION_REF_TYPE,
  DEFAULT_EXECUTIVE_TELEMETRY_DAYS,
} from "../governance/executive-trust-telemetry.js";
import type { GovernanceActionLogEntry } from "../governance/governance-capture.js";
import type { ExecutiveAction } from "../governance/executive-trust-layer.js";

function makeEntry(
  overrides: Partial<GovernanceActionLogEntry> = {}
): GovernanceActionLogEntry {
  return {
    id: "e1",
    at: new Date().toISOString(),
    workflow: EXECUTIVE_TRUST_WORKFLOW,
    action: EXECUTIVE_ACTION_LOG_VERB,
    refType: EXECUTIVE_ACTION_REF_TYPE,
    refId: "my-action-key",
    relatedPaths: [],
    ...overrides,
  };
}

function makeAction(overrides: Partial<ExecutiveAction> = {}): ExecutiveAction {
  return {
    label: "Test action",
    href: "/test",
    kind: "nav",
    actionKey: "my-action-key",
    ...overrides,
  };
}

describe("lastExecutiveActionCompletionAt", () => {
  it("returns undefined when no entries match", () => {
    const result = lastExecutiveActionCompletionAt([], makeAction(), DEFAULT_EXECUTIVE_TELEMETRY_DAYS);
    expect(result).toBeUndefined();
  });

  it("returns undefined when action has no actionKey", () => {
    const entries = [makeEntry()];
    const action = makeAction({ actionKey: undefined });
    expect(lastExecutiveActionCompletionAt(entries, action, DEFAULT_EXECUTIVE_TELEMETRY_DAYS)).toBeUndefined();
  });

  it("returns the timestamp of a matching entry", () => {
    const ts = new Date().toISOString();
    const entries = [makeEntry({ at: ts })];
    const result = lastExecutiveActionCompletionAt(entries, makeAction(), DEFAULT_EXECUTIVE_TELEMETRY_DAYS);
    expect(result).toBe(ts);
  });

  it("returns undefined for entries outside the time window", () => {
    const oldTs = new Date(Date.now() - 30 * 86_400_000).toISOString(); // 30 days ago
    const entries = [makeEntry({ at: oldTs })];
    const result = lastExecutiveActionCompletionAt(entries, makeAction(), DEFAULT_EXECUTIVE_TELEMETRY_DAYS);
    // 14-day window, entry is 30 days old
    expect(result).toBeUndefined();
  });

  it("returns the latest timestamp when multiple entries match", () => {
    const older = new Date(Date.now() - 5 * 86_400_000).toISOString(); // 5 days ago
    const newer = new Date(Date.now() - 1 * 86_400_000).toISOString(); // 1 day ago
    const entries = [makeEntry({ id: "e1", at: older }), makeEntry({ id: "e2", at: newer })];
    const result = lastExecutiveActionCompletionAt(entries, makeAction(), DEFAULT_EXECUTIVE_TELEMETRY_DAYS);
    expect(result).toBe(newer);
  });

  it("ignores entries with a different actionKey (refId)", () => {
    const entries = [makeEntry({ refId: "different-key" })];
    const result = lastExecutiveActionCompletionAt(entries, makeAction(), DEFAULT_EXECUTIVE_TELEMETRY_DAYS);
    expect(result).toBeUndefined();
  });

  it("ignores entries with wrong workflow", () => {
    const entries = [makeEntry({ workflow: "canon_promotion" })];
    const result = lastExecutiveActionCompletionAt(entries, makeAction(), DEFAULT_EXECUTIVE_TELEMETRY_DAYS);
    expect(result).toBeUndefined();
  });

  it("respects targetPath matching when action has a targetPath", () => {
    const action = makeAction({ targetPath: "wiki/test/page.md" });
    const matchingEntry = makeEntry({ relatedPaths: ["wiki/test/page.md"] });
    const nonMatchingEntry = makeEntry({ relatedPaths: ["wiki/other/page.md"] });

    const result1 = lastExecutiveActionCompletionAt([matchingEntry], action, DEFAULT_EXECUTIVE_TELEMETRY_DAYS);
    expect(result1).toBeTruthy();

    const result2 = lastExecutiveActionCompletionAt([nonMatchingEntry], action, DEFAULT_EXECUTIVE_TELEMETRY_DAYS);
    expect(result2).toBeUndefined();
  });
});

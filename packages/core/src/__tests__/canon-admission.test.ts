import { describe, it, expect } from "vitest";
import {
  summarizeCanonAdmissionReadiness,
  isCanonAdmissionBlocked,
  type CanonAdmissionCriterion,
  type CanonAdmissionRecord,
} from "../governance/canon-admission.js";

function makeCriteria(overrides: Partial<CanonAdmissionCriterion>[] = []): CanonAdmissionCriterion[] {
  return overrides.map((o, i) => ({
    id: `c${i}`,
    label: `Criterion ${i}`,
    verdict: "pass" as const,
    note: "",
    tier: "advisory" as const,
    ...o,
  }));
}

function makeRecord(
  criteria: CanonAdmissionCriterion[],
  readinessSummary?: CanonAdmissionRecord["readinessSummary"]
): CanonAdmissionRecord {
  return {
    id: "rec-1",
    targetPage: "wiki/test.md",
    context: "manual",
    criteria,
    updatedAt: new Date().toISOString(),
    readinessSummary,
  };
}

describe("summarizeCanonAdmissionReadiness", () => {
  it("returns 'safe' when all criteria pass", () => {
    const criteria = makeCriteria([
      { verdict: "pass", tier: "advisory" },
      { verdict: "pass", tier: "strong" },
    ]);
    expect(summarizeCanonAdmissionReadiness(criteria)).toBe("safe");
  });

  it("returns 'admit_with_warnings' when an advisory criterion fails", () => {
    const criteria = makeCriteria([
      { verdict: "fail", tier: "advisory" },
      { verdict: "pass", tier: "strong" },
    ]);
    expect(summarizeCanonAdmissionReadiness(criteria)).toBe("admit_with_warnings");
  });

  it("returns 'admit_with_warnings' when there are only warnings", () => {
    const criteria = makeCriteria([{ verdict: "warn", tier: "advisory" }]);
    expect(summarizeCanonAdmissionReadiness(criteria)).toBe("admit_with_warnings");
  });

  it("returns 'blocked' when a strong criterion fails", () => {
    const criteria = makeCriteria([
      { verdict: "fail", tier: "strong" },
      { verdict: "pass", tier: "advisory" },
    ]);
    expect(summarizeCanonAdmissionReadiness(criteria)).toBe("blocked");
  });

  it("blocked takes precedence over advisory failures", () => {
    const criteria = makeCriteria([
      { verdict: "fail", tier: "strong" },
      { verdict: "fail", tier: "advisory" },
    ]);
    expect(summarizeCanonAdmissionReadiness(criteria)).toBe("blocked");
  });

  it("handles empty criteria as 'safe'", () => {
    expect(summarizeCanonAdmissionReadiness([])).toBe("safe");
  });
});

describe("isCanonAdmissionBlocked", () => {
  it("uses cached readinessSummary when present", () => {
    const rec = makeRecord([], "blocked");
    expect(isCanonAdmissionBlocked(rec)).toBe(true);
  });

  it("uses cached readinessSummary = 'safe'", () => {
    const rec = makeRecord([], "safe");
    expect(isCanonAdmissionBlocked(rec)).toBe(false);
  });

  it("falls back to computing from criteria when readinessSummary absent", () => {
    const criteria = makeCriteria([{ verdict: "fail", tier: "strong" }]);
    const rec = makeRecord(criteria); // no readinessSummary
    expect(isCanonAdmissionBlocked(rec)).toBe(true);
  });

  it("falls back correctly for a passing record", () => {
    const criteria = makeCriteria([{ verdict: "pass", tier: "strong" }]);
    const rec = makeRecord(criteria);
    expect(isCanonAdmissionBlocked(rec)).toBe(false);
  });
});

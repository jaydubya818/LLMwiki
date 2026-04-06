import { describe, it, expect } from "vitest";
import { summarizeConfidenceForPage, type ConfidenceHistoryFile } from "../governance/confidence-history.js";

function makeHistory(snapshots: Array<{ composite0to100: number; at?: string }>): ConfidenceHistoryFile {
  const page = "wiki/test/page.md";
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    pages: [
      {
        path: page,
        snapshots: snapshots.map((s, i) => ({
          at: s.at ?? new Date(Date.now() - (snapshots.length - i) * 86_400_000).toISOString(),
          composite0to100: s.composite0to100,
          openUnsupported: 0,
          driftOpen: false,
          conflictOpen: false,
          canonicalBoost: 0,
        })),
      },
    ],
  };
}

describe("summarizeConfidenceForPage", () => {
  it("returns unknown trend when hist is null", () => {
    const r = summarizeConfidenceForPage(null, "wiki/foo.md");
    expect(r.trend).toBe("unknown");
    expect(r.sparkline).toEqual([]);
    expect(r.current).toBeUndefined();
  });

  it("returns unknown trend when page has no snapshots", () => {
    const hist: ConfidenceHistoryFile = {
      version: 1, updatedAt: new Date().toISOString(), pages: [],
    };
    const r = summarizeConfidenceForPage(hist, "wiki/missing.md");
    expect(r.trend).toBe("unknown");
  });

  it("returns unknown trend when only one snapshot exists", () => {
    const hist = makeHistory([{ composite0to100: 75 }]);
    const r = summarizeConfidenceForPage(hist, "wiki/test/page.md");
    expect(r.trend).toBe("unknown");
    expect(r.current?.composite0to100).toBe(75);
  });

  it("returns 'improving' when score goes up by more than 2", () => {
    const hist = makeHistory([
      { composite0to100: 60 },
      { composite0to100: 75 }, // delta = +15
    ]);
    const r = summarizeConfidenceForPage(hist, "wiki/test/page.md");
    expect(r.trend).toBe("improving");
    expect(r.recentDelta).toBe(15);
  });

  it("returns 'declining' when score drops by more than 2", () => {
    const hist = makeHistory([
      { composite0to100: 80 },
      { composite0to100: 60 }, // delta = -20
    ]);
    const r = summarizeConfidenceForPage(hist, "wiki/test/page.md");
    expect(r.trend).toBe("declining");
  });

  it("returns 'stable' when delta is within ±2", () => {
    const hist = makeHistory([
      { composite0to100: 70 },
      { composite0to100: 71 }, // delta = +1
    ]);
    const r = summarizeConfidenceForPage(hist, "wiki/test/page.md");
    expect(r.trend).toBe("stable");
  });

  it("returns correct sparkline values", () => {
    const hist = makeHistory([
      { composite0to100: 50 },
      { composite0to100: 60 },
      { composite0to100: 70 },
    ]);
    const r = summarizeConfidenceForPage(hist, "wiki/test/page.md");
    expect(r.sparkline).toEqual([50, 60, 70]);
  });
});

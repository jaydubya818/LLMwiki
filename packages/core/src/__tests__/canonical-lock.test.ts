import { describe, it, expect } from "vitest";
import {
  parseWikiEditPolicy,
  blocksAutoIngestMerge,
  lockBadgeLabel,
} from "../trust/canonical-lock.js";

describe("parseWikiEditPolicy", () => {
  it("returns 'open' when no policy field is present", () => {
    expect(parseWikiEditPolicy({})).toBe("open");
  });

  it("returns 'locked' for wiki_edit_policy: locked", () => {
    expect(parseWikiEditPolicy({ wiki_edit_policy: "locked" })).toBe("locked");
  });

  it("returns 'manual_review' for wiki_edit_policy: manual_review", () => {
    expect(parseWikiEditPolicy({ wiki_edit_policy: "manual_review" })).toBe("manual_review");
  });

  it("returns 'open' for wiki_edit_policy: open", () => {
    expect(parseWikiEditPolicy({ wiki_edit_policy: "open" })).toBe("open");
  });

  it("returns 'manual_review' when canonical: true (boolean)", () => {
    expect(parseWikiEditPolicy({ canonical: true })).toBe("manual_review");
  });

  it("returns 'manual_review' when canonical: 'true' (string)", () => {
    expect(parseWikiEditPolicy({ canonical: "true" })).toBe("manual_review");
  });

  it("returns 'manual_review' when canonical: 'yes'", () => {
    expect(parseWikiEditPolicy({ canonical: "yes" })).toBe("manual_review");
  });

  it("returns 'open' when canonical: false", () => {
    expect(parseWikiEditPolicy({ canonical: false })).toBe("open");
  });

  it("explicit wiki_edit_policy takes precedence over canonical flag", () => {
    // 'locked' overrides canonical: false
    expect(parseWikiEditPolicy({ wiki_edit_policy: "locked", canonical: false })).toBe("locked");
  });

  it("ignores unrecognised wiki_edit_policy values and falls back to canonical", () => {
    expect(parseWikiEditPolicy({ wiki_edit_policy: "unknown_value", canonical: true })).toBe(
      "manual_review"
    );
  });
});

describe("blocksAutoIngestMerge", () => {
  it("blocks for locked", () => {
    expect(blocksAutoIngestMerge("locked")).toBe(true);
  });

  it("blocks for manual_review", () => {
    expect(blocksAutoIngestMerge("manual_review")).toBe(true);
  });

  it("does not block for open", () => {
    expect(blocksAutoIngestMerge("open")).toBe(false);
  });
});

describe("lockBadgeLabel", () => {
  it("returns 'Locked' for locked", () => {
    expect(lockBadgeLabel("locked")).toBe("Locked");
  });

  it("returns 'Manual review' for manual_review", () => {
    expect(lockBadgeLabel("manual_review")).toBe("Manual review");
  });

  it("returns 'Open' for open", () => {
    expect(lockBadgeLabel("open")).toBe("Open");
  });
});

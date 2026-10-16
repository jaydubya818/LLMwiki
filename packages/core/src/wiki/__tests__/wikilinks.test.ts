import { describe, it, expect } from "vitest";
import { extractWikilinks, slugifyWikiName } from "../wikilinks.js";

describe("extractWikilinks", () => {
  it("extracts [[Target]] wikilinks from markdown", () => {
    expect(extractWikilinks("See [[Project Alpha]] for details.")).toEqual([
      "Project Alpha",
    ]);
  });

  it("returns the target before the pipe in an aliased link [[Target|Alias]]", () => {
    expect(extractWikilinks("[[Project Alpha|the project]] shipped.")).toEqual([
      "Project Alpha",
    ]);
  });

  it("trims whitespace around the target and alias", () => {
    expect(extractWikilinks("[[  Project Alpha  |  alias  ]]")).toEqual([
      "Project Alpha",
    ]);
  });

  it("dedupes repeated links and preserves first-seen order", () => {
    expect(
      extractWikilinks("[[A]] then [[B]] then [[A]] again, then [[C]].")
    ).toEqual(["A", "B", "C"]);
  });

  it("returns an empty array when there are no wikilinks", () => {
    expect(extractWikilinks("Just plain markdown, no links here.")).toEqual([]);
  });

  it("handles multiple links on the same line without overlap", () => {
    expect(extractWikilinks("[[One]][[Two]][[Three]]")).toEqual([
      "One",
      "Two",
      "Three",
    ]);
  });
});

describe("slugifyWikiName", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugifyWikiName("Project Alpha")).toBe("project-alpha");
  });

  it("strips straight and curly quotes", () => {
    expect(slugifyWikiName("Jay's Notes")).toBe("jays-notes");
  });

  it("collapses runs of non-alphanumeric characters into a single hyphen", () => {
    expect(slugifyWikiName("Q3 2026 -- Review!!")).toBe("q3-2026-review");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugifyWikiName("--Already Slug--")).toBe("already-slug");
  });

  it("returns an empty string for input with no alphanumeric characters", () => {
    expect(slugifyWikiName("***")).toBe("");
  });
});

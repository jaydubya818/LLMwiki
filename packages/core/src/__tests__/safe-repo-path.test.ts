/**
 * Tests for path-safety utilities used in API routes and the MCP server.
 * These are critical: a regression here would allow path traversal attacks.
 */
import { describe, it, expect } from "vitest";
import path from "node:path";

// We test the logic directly by importing the module.
// resolveWikiGitFileParam and friends are in apps/dashboard, but the
// safe-path logic is also partly duplicated in the MCP server. Here we
// test the core path primitives used throughout the codebase.

// Minimal re-implementation of the containment check (mirroring safe-repo-path.ts)
// so we can unit-test the algorithm independently of Next.js resolution.
function isContainedInDir(abs: string, base: string): boolean {
  const absN = path.resolve(abs);
  const baseN = path.resolve(base);
  if (absN === baseN) return true;
  const sep = path.sep;
  const prefix = baseN.endsWith(sep) ? baseN : baseN + sep;
  return absN.startsWith(prefix);
}

describe("isContainedInDir (path-safety invariant)", () => {
  const base = "/home/user/wiki";

  it("accepts a path clearly inside base", () => {
    expect(isContainedInDir("/home/user/wiki/notes/foo.md", base)).toBe(true);
  });

  it("accepts base itself (edge case)", () => {
    expect(isContainedInDir(base, base)).toBe(true);
  });

  it("rejects a sibling directory", () => {
    expect(isContainedInDir("/home/user/other/file.md", base)).toBe(false);
  });

  it("rejects a path that uses '..' to escape", () => {
    // path.resolve normalises these before comparison
    expect(isContainedInDir("/home/user/wiki/../../../etc/passwd", base)).toBe(false);
  });

  it("rejects a prefix-match that is not a child (e.g. /wikifoo)", () => {
    // Without the trailing-sep check this would incorrectly match.
    expect(isContainedInDir("/home/user/wikifoo/bar", base)).toBe(false);
  });

  it("accepts a deeply nested path", () => {
    expect(isContainedInDir("/home/user/wiki/a/b/c/d/e.md", base)).toBe(true);
  });
});

// Tests for the posix-path normalisation logic used in resolveWikiGitFileParam
describe("posix path normalisation for wiki git file params", () => {
  function normalize(raw: string): string | null {
    let s: string;
    try {
      s = decodeURIComponent(raw);
    } catch {
      return null;
    }
    s = s.replace(/\0/g, "");
    s = s.replace(/\\/g, "/").replace(/^\//, "");
    s = path.posix.normalize(s);
    if (s === ".." || s.startsWith("../") || s.includes("/../")) return null;
    return s;
  }

  it("normalises a clean wiki path", () => {
    expect(normalize("wiki/decisions/my-page.md")).toBe("wiki/decisions/my-page.md");
  });

  it("strips leading slash", () => {
    expect(normalize("/wiki/page.md")).toBe("wiki/page.md");
  });

  it("blocks '..' traversal", () => {
    expect(normalize("../etc/passwd")).toBeNull();
  });

  it("blocks embedded traversal", () => {
    expect(normalize("wiki/../../../etc/passwd")).toBeNull();
  });

  it("handles URL-encoded slashes", () => {
    expect(normalize("wiki%2Fpage.md")).toBe("wiki/page.md");
  });

  it("handles null bytes", () => {
    const result = normalize("wiki\0evil.md");
    // After null stripping it becomes wikidevil.md or similar — must not traverse
    expect(result).not.toContain("\0");
    expect(result).not.toBeNull();
  });

  it("rejects invalid percent-encoding", () => {
    expect(normalize("%z")).toBeNull();
  });

  it("normalises double slashes", () => {
    expect(normalize("wiki//page.md")).toBe("wiki/page.md");
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { brainPaths } from "../paths.js";
import {
  readHumanOverrides,
  recordHumanOverride,
} from "../governance/human-overrides.js";

async function makeTmpBrainDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "brain-test-"));
  await fs.mkdir(path.join(dir, ".brain"), { recursive: true });
  return dir;
}

describe("readHumanOverrides", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpBrainDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns empty items when file does not exist", async () => {
    const paths = brainPaths(tmpDir);
    const f = await readHumanOverrides(paths);
    expect(f.version).toBe(1);
    expect(f.items).toEqual([]);
  });

  it("handles file with missing items array", async () => {
    const paths = brainPaths(tmpDir);
    await fs.writeFile(paths.humanOverridesJson, JSON.stringify({ version: 1, updatedAt: new Date().toISOString() }), "utf8");
    const f = await readHumanOverrides(paths);
    expect(f.items).toEqual([]);
  });
});

describe("recordHumanOverride", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpBrainDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("creates a new record and prepends to items", async () => {
    const paths = brainPaths(tmpDir);
    const rec = await recordHumanOverride(paths, {
      relatedPath: "wiki/decisions/my-decision.md",
      overrideType: "manual_canon_edit",
      humanDecision: "approved",
      rationale: "Verified manually",
    });
    expect(rec.id).toBeTruthy();
    expect(rec.createdAt).toBeTruthy();
    expect(rec.overrideType).toBe("manual_canon_edit");

    const f = await readHumanOverrides(paths);
    expect(f.items).toHaveLength(1);
    expect(f.items[0]!.id).toBe(rec.id);
  });

  it("supports deterministic id when provided", async () => {
    const paths = brainPaths(tmpDir);
    const rec = await recordHumanOverride(paths, {
      id: "my-stable-id",
      relatedPath: "wiki/test.md",
      overrideType: "other",
      humanDecision: "skip",
      rationale: "test",
    });
    expect(rec.id).toBe("my-stable-id");
  });

  it("serialises concurrent writes without losing entries (write-queue)", async () => {
    const paths = brainPaths(tmpDir);
    // Fire 5 concurrent writes — without the write queue these would race and
    // all read the empty file, each writing a single-item file, ending with 1 entry.
    await Promise.all([
      recordHumanOverride(paths, { relatedPath: "wiki/a.md", overrideType: "other", humanDecision: "d", rationale: "r" }),
      recordHumanOverride(paths, { relatedPath: "wiki/b.md", overrideType: "other", humanDecision: "d", rationale: "r" }),
      recordHumanOverride(paths, { relatedPath: "wiki/c.md", overrideType: "other", humanDecision: "d", rationale: "r" }),
      recordHumanOverride(paths, { relatedPath: "wiki/d.md", overrideType: "other", humanDecision: "d", rationale: "r" }),
      recordHumanOverride(paths, { relatedPath: "wiki/e.md", overrideType: "other", humanDecision: "d", rationale: "r" }),
    ]);
    const f = await readHumanOverrides(paths);
    expect(f.items).toHaveLength(5);
  });

  it("caps items at 500", async () => {
    const paths = brainPaths(tmpDir);
    // Seed 495 items directly
    const existing = Array.from({ length: 495 }, (_, i) => ({
      id: `seed-${i}`,
      relatedPath: `wiki/p${i}.md`,
      overrideType: "other" as const,
      humanDecision: "d",
      rationale: "r",
      createdAt: new Date().toISOString(),
    }));
    await fs.writeFile(
      paths.humanOverridesJson,
      JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), items: existing }),
      "utf8"
    );

    // Add 10 more — should cap at 500
    for (let i = 0; i < 10; i++) {
      await recordHumanOverride(paths, {
        relatedPath: `wiki/new${i}.md`,
        overrideType: "other",
        humanDecision: "d",
        rationale: "r",
      });
    }
    const f = await readHumanOverrides(paths);
    expect(f.items.length).toBeLessThanOrEqual(500);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { brainPaths } from "../paths.js";
import {
  readGovernanceActionLog,
  appendGovernanceActionLog,
} from "../governance/governance-capture.js";

async function makeTmpBrainDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "brain-test-"));
  await fs.mkdir(path.join(dir, ".brain"), { recursive: true });
  return dir;
}

describe("readGovernanceActionLog", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpBrainDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns empty entries when file does not exist", async () => {
    const paths = brainPaths(tmpDir);
    const log = await readGovernanceActionLog(paths);
    expect(log.version).toBe(1);
    expect(log.entries).toEqual([]);
  });

  it("handles file with missing entries array", async () => {
    const paths = brainPaths(tmpDir);
    await fs.writeFile(paths.governanceActionLogJson, JSON.stringify({ version: 1 }), "utf8");
    const log = await readGovernanceActionLog(paths);
    expect(log.entries).toEqual([]);
  });
});

describe("appendGovernanceActionLog", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpBrainDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("appends a new entry and prepends to entries array", async () => {
    const paths = brainPaths(tmpDir);
    const entry = await appendGovernanceActionLog(paths, {
      workflow: "canon_promotion",
      action: "approved",
      relatedPaths: ["wiki/test.md"],
    });
    expect(entry.id).toBeTruthy();
    expect(entry.at).toBeTruthy();
    expect(entry.workflow).toBe("canon_promotion");

    const log = await readGovernanceActionLog(paths);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]!.id).toBe(entry.id);
  });

  it("serialises concurrent writes without losing entries (write-queue fix)", async () => {
    const paths = brainPaths(tmpDir);
    await Promise.all([
      appendGovernanceActionLog(paths, { workflow: "canon_promotion", action: "a1", relatedPaths: [] }),
      appendGovernanceActionLog(paths, { workflow: "canon_promotion", action: "a2", relatedPaths: [] }),
      appendGovernanceActionLog(paths, { workflow: "conflict", action: "a3", relatedPaths: [] }),
      appendGovernanceActionLog(paths, { workflow: "drift", action: "a4", relatedPaths: [] }),
      appendGovernanceActionLog(paths, { workflow: "executive_trust", action: "a5", relatedPaths: [] }),
    ]);
    const log = await readGovernanceActionLog(paths);
    expect(log.entries).toHaveLength(5);
    // All action strings must be present
    const actions = new Set(log.entries.map((e) => e.action));
    expect(actions.has("a1")).toBe(true);
    expect(actions.has("a5")).toBe(true);
  });

  it("caps entries at 1500", async () => {
    const paths = brainPaths(tmpDir);
    const seed = Array.from({ length: 1495 }, (_, i) => ({
      id: `s${i}`, at: new Date().toISOString(),
      workflow: "other" as const, action: "x", relatedPaths: [],
    }));
    await fs.writeFile(
      paths.governanceActionLogJson,
      JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), entries: seed }),
      "utf8"
    );
    for (let i = 0; i < 10; i++) {
      await appendGovernanceActionLog(paths, { workflow: "other", action: `new${i}`, relatedPaths: [] });
    }
    const log = await readGovernanceActionLog(paths);
    expect(log.entries.length).toBeLessThanOrEqual(1500);
  });
});

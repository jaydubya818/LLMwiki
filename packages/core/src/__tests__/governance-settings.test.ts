import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { brainPaths } from "../paths.js";
import {
  readGovernanceSettings,
  writeGovernanceSettings,
  patchGovernanceSettings,
} from "../governance/governance-settings.js";

async function makeTmpBrainDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "brain-test-"));
  await fs.mkdir(path.join(dir, ".brain"), { recursive: true });
  return dir;
}

describe("readGovernanceSettings", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpBrainDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when no file exists", async () => {
    const paths = brainPaths(tmpDir);
    const s = await readGovernanceSettings(paths);
    expect(s.version).toBe(1);
    expect(s.autoCaptureOverrides).toBe(true);
    expect(s.canonGuardEnabled).toBe(true);
    expect(s.snapshotMaxAgeDaysForCanon).toBe(21);
    expect(s.canonGuardIgnorePrefixes).toEqual([]);
    expect(s.canonGuardIgnorePaths).toEqual([]);
  });

  it("merges partial file with defaults", async () => {
    const paths = brainPaths(tmpDir);
    await fs.writeFile(
      paths.governanceSettingsJson,
      JSON.stringify({ autoCaptureOverrides: false }),
      "utf8"
    );
    const s = await readGovernanceSettings(paths);
    expect(s.autoCaptureOverrides).toBe(false);
    // rest still default
    expect(s.canonGuardEnabled).toBe(true);
    expect(s.version).toBe(1); // version always forced to 1
  });

  it("handles corrupted JSON gracefully by returning defaults", async () => {
    const paths = brainPaths(tmpDir);
    await fs.writeFile(paths.governanceSettingsJson, "{ broken json [[[", "utf8");
    const s = await readGovernanceSettings(paths);
    expect(s.autoCaptureOverrides).toBe(true);
  });
});

describe("writeGovernanceSettings + patchGovernanceSettings", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpBrainDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("roundtrips a settings write", async () => {
    const paths = brainPaths(tmpDir);
    const s = await readGovernanceSettings(paths);
    const modified = { ...s, autoCaptureOverrides: false, snapshotMaxAgeDaysForCanon: 7 };
    await writeGovernanceSettings(paths, modified);
    const back = await readGovernanceSettings(paths);
    expect(back.autoCaptureOverrides).toBe(false);
    expect(back.snapshotMaxAgeDaysForCanon).toBe(7);
  });

  it("patchGovernanceSettings applies partial patch", async () => {
    const paths = brainPaths(tmpDir);
    await patchGovernanceSettings(paths, { canonGuardHookWarnOnly: false });
    const s = await readGovernanceSettings(paths);
    expect(s.canonGuardHookWarnOnly).toBe(false);
    // unchanged fields persist
    expect(s.canonGuardEnabled).toBe(true);
  });

  it("patchGovernanceSettings with array fields", async () => {
    const paths = brainPaths(tmpDir);
    const prefixes = ["wiki/drafts/", "wiki/scratch/"];
    await patchGovernanceSettings(paths, { canonGuardIgnorePrefixes: prefixes });
    const s = await readGovernanceSettings(paths);
    expect(s.canonGuardIgnorePrefixes).toEqual(prefixes);
  });

  it("forces version to 1 even if patch tries to change it", async () => {
    const paths = brainPaths(tmpDir);
    // TypeScript prevents this in typed code, but guard against runtime abuse
    await patchGovernanceSettings(paths, {} as Parameters<typeof patchGovernanceSettings>[1]);
    const s = await readGovernanceSettings(paths);
    expect(s.version).toBe(1);
  });
});

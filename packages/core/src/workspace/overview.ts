import path from "node:path";
import fs from "node:fs/promises";
import { readRegistry, readActiveBrain, resolveBrainRootAbsolute } from "./registry.js";
import { brainPaths } from "../paths.js";
import { listRuns } from "../runs.js";

export interface BrainListRow {
  name: string;
  type: string;
  path: string;
  abs: string;
}

export async function listBrainsWorkspace(
  workspaceRoot: string
): Promise<BrainListRow[]> {
  const ws = path.resolve(workspaceRoot);
  const reg = await readRegistry(ws);
  return reg.brains.map((b) => ({
    name: b.name,
    type: b.type,
    path: b.path,
    abs: resolveBrainRootAbsolute(ws, b),
  }));
}

export interface WorkspaceStatus {
  workspaceRoot: string;
  activeBrain: string | null;
  brains: BrainListRow[];
  recentRuns: Array<{
    brain: string;
    kind: string;
    summary: string;
    ok: boolean;
    startedAt: string;
  }>;
}

export async function getWorkspaceStatus(
  workspaceRoot: string,
  runLimitPerBrain = 3
): Promise<WorkspaceStatus> {
  const ws = path.resolve(workspaceRoot);
  const active = await readActiveBrain(ws);
  const brains = await listBrainsWorkspace(ws);
  const recentRuns: WorkspaceStatus["recentRuns"] = [];
  for (const b of brains) {
    const paths = brainPaths(b.abs);
    const runs = await listRuns(paths, runLimitPerBrain);
    for (const r of runs) {
      recentRuns.push({
        brain: b.name,
        kind: r.kind,
        summary: r.summary,
        ok: r.ok,
        startedAt: r.startedAt,
      });
    }
  }
  recentRuns.sort((a, b) => (a.startedAt > b.startedAt ? -1 : 1));
  return {
    workspaceRoot: ws,
    activeBrain: active?.name ?? null,
    brains,
    recentRuns: recentRuns.slice(0, 24),
  };
}

export async function writeSyncSummaryFile(
  workspaceRoot: string,
  md: string
): Promise<string> {
  const dir = path.join(workspaceRoot, ".workspace");
  await fs.mkdir(dir, { recursive: true });
  const f = path.join(dir, `sync-summary-${new Date().toISOString().slice(0, 10)}.md`);
  await fs.writeFile(f, md, "utf8");
  return f;
}

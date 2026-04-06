import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";
import type { BrainPaths } from "./paths.js";

export type RunKind =
  | "ingest"
  | "compile"
  | "lint"
  | "ask"
  | "review"
  | "video"
  | "graph"
  | "output";

export interface RunRecord {
  id: string;
  kind: RunKind;
  startedAt: string;
  finishedAt?: string;
  ok: boolean;
  summary: string;
  details?: Record<string, unknown>;
  errors?: string[];
}

export async function writeRun(
  paths: BrainPaths,
  record: Omit<RunRecord, "id" | "startedAt"> & {
    id?: string;
    startedAt?: string;
  }
): Promise<RunRecord> {
  await fs.mkdir(paths.runsDir, { recursive: true });
  const full: RunRecord = {
    id: record.id ?? uuid(),
    startedAt: record.startedAt ?? new Date().toISOString(),
    kind: record.kind,
    ok: record.ok,
    summary: record.summary,
    finishedAt: record.finishedAt,
    details: record.details,
    errors: record.errors,
  };
  const file = path.join(paths.runsDir, `${full.startedAt.slice(0, 10)}-${full.kind}-${full.id}.json`);
  await fs.writeFile(file, JSON.stringify(full, null, 2), "utf8");
  return full;
}

export async function listRuns(paths: BrainPaths, limit = 50): Promise<RunRecord[]> {
  try {
    const files = await fs.readdir(paths.runsDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json")).sort().reverse();
    const out: RunRecord[] = [];
    for (const f of jsonFiles.slice(0, limit)) {
      const raw = await fs.readFile(path.join(paths.runsDir, f), "utf8");
      out.push(JSON.parse(raw) as RunRecord);
    }
    return out;
  } catch {
    return [];
  }
}

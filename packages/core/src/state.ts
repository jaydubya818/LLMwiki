import fs from "node:fs/promises";
import path from "node:path";
import type { BrainPaths } from "./paths.js";

export interface BrainState {
  version: 1;
  lastIngestAt?: string;
  lastCompileAt?: string;
  lastLintAt?: string;
  lastGraphAt?: string;
  /** ISO timestamp of last `brain review` / executive weekly */
  lastReviewAt?: string;
  pendingWikiChanges?: string[];
}

const defaultState: BrainState = { version: 1 };

export async function readState(paths: BrainPaths): Promise<BrainState> {
  try {
    const raw = await fs.readFile(paths.stateJson, "utf8");
    return { ...defaultState, ...JSON.parse(raw) };
  } catch {
    return { ...defaultState };
  }
}

export async function writeState(
  paths: BrainPaths,
  patch: Partial<BrainState>
): Promise<BrainState> {
  await fs.mkdir(path.dirname(paths.stateJson), { recursive: true });
  const next = { ...(await readState(paths)), ...patch };
  await fs.writeFile(paths.stateJson, JSON.stringify(next, null, 2), "utf8");
  return next;
}

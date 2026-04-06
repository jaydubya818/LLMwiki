import fs from "node:fs/promises";
import path from "node:path";
import type { BrainConfig } from "../config.js";
import type { BrainPaths } from "../paths.js";
import {
  stageWikiAndCommitForBrain,
  discardWikiFileForBrain,
} from "../git/service.js";
import { appendLog } from "../log-append.js";

export type FileDecision = "pending" | "approved" | "rejected";

export interface ReviewState {
  updatedAt: string;
  files: Record<string, FileDecision>;
}

export async function readReviewState(
  paths: BrainPaths
): Promise<ReviewState> {
  try {
    const raw = await fs.readFile(paths.reviewStateJson, "utf8");
    return JSON.parse(raw) as ReviewState;
  } catch {
    return { updatedAt: new Date().toISOString(), files: {} };
  }
}

export async function writeReviewState(
  paths: BrainPaths,
  state: ReviewState
): Promise<void> {
  await fs.mkdir(path.dirname(paths.reviewStateJson), { recursive: true });
  await fs.writeFile(paths.reviewStateJson, JSON.stringify(state, null, 2), "utf8");
}

export async function setFileDecision(
  paths: BrainPaths,
  relPath: string,
  decision: FileDecision
): Promise<ReviewState> {
  const state = await readReviewState(paths);
  state.files[relPath] = decision;
  state.updatedAt = new Date().toISOString();
  await writeReviewState(paths, state);
  return state;
}

export async function applyReviewDecisions(
  cfg: BrainConfig,
  paths: BrainPaths
): Promise<{ committed: boolean; message: string }> {
  const state = await readReviewState(paths);
  const rejected = Object.entries(state.files)
    .filter(([, d]) => d === "rejected")
    .map(([p]) => p);
  for (const p of rejected) {
    await discardWikiFileForBrain(cfg, p);
  }
  const approved = Object.entries(state.files)
    .filter(([, d]) => d === "approved")
    .map(([p]) => p);
  if (approved.length === 0) {
    return { committed: false, message: "No approved files to commit." };
  }
  const message = `wiki(${cfg.brainName}): approve ${approved.length} pages`;
  await stageWikiAndCommitForBrain(cfg, message, approved);
  await writeReviewState(paths, { updatedAt: new Date().toISOString(), files: {} });
  await appendLog(paths, `approve: committed ${approved.join(", ")}`);
  return { committed: true, message };
}

export async function commitAllWikiForBrain(
  cfg: BrainConfig,
  paths: BrainPaths,
  message: string
): Promise<void> {
  await stageWikiAndCommitForBrain(cfg, message);
  await appendLog(paths, `approve: full wiki commit — ${message}`);
}

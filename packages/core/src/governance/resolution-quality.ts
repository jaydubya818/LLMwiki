import fs from "node:fs/promises";
import path from "node:path";
import type { BrainPaths } from "../paths.js";
import { brainPaths } from "../paths.js";
import type { BrainConfig } from "../config.js";
import { readConflicts } from "../trust/conflicts.js";

export type ResolutionQualityBucket = "thin" | "adequate" | "strong";

export interface ResolutionQualityRow {
  id: string;
  kind: "conflict";
  topic: string;
  status: string;
  resolutionNote?: string;
  score0to100: number;
  bucket: ResolutionQualityBucket;
  dimensions: string[];
}

export interface ResolutionQualityFile {
  version: 1;
  updatedAt: string;
  rows: ResolutionQualityRow[];
}

export async function readResolutionQuality(paths: BrainPaths): Promise<ResolutionQualityFile | null> {
  try {
    const raw = await fs.readFile(paths.resolutionQualityJson, "utf8");
    return JSON.parse(raw) as ResolutionQualityFile;
  } catch {
    return null;
  }
}

export async function writeResolutionQuality(
  paths: BrainPaths,
  f: ResolutionQualityFile
): Promise<void> {
  await fs.mkdir(path.dirname(paths.resolutionQualityJson), { recursive: true });
  await fs.writeFile(
    paths.resolutionQualityJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

function scoreConflictResolution(note: string | undefined, status: string): {
  score: number;
  bucket: ResolutionQualityBucket;
  dimensions: string[];
} {
  const dimensions: string[] = [];
  let score = 35;
  const n = (note ?? "").trim();
  if (n.length >= 400) {
    score += 22;
    dimensions.push("long-form rationale");
  } else if (n.length >= 120) {
    score += 15;
    dimensions.push("substantive note");
  } else if (n.length > 0) {
    score += 6;
    dimensions.push("brief note");
  } else {
    dimensions.push("no resolution text");
  }

  if (/\b(http|https):\/\/|\[\[wiki\//i.test(n)) {
    score += 18;
    dimensions.push("links or wikilinks");
  }
  if (/\b(decided|outcome|because|therefore|chosen)\b/i.test(n)) {
    score += 12;
    dimensions.push("explicit outcome language");
  }
  if (/\b(follow|next|verify|recheck)\b/i.test(n)) {
    score += 8;
    dimensions.push("follow-up mentioned");
  }

  if (status === "accepted-as-tension") {
    score += 5;
    dimensions.push("tension held explicitly");
  }

  if (/^(ok|done|fixed|n\/a)\b/i.test(n)) {
    score -= 15;
    dimensions.push("possible shallow dismissal");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  let bucket: ResolutionQualityBucket = "thin";
  if (score >= 72) bucket = "strong";
  else if (score >= 48) bucket = "adequate";
  return { score, bucket, dimensions };
}

/**
 * Heuristic quality for **resolved** conflicts only — encourages better notes without claiming objectivity.
 */
export async function buildResolutionQualityIndex(cfg: BrainConfig): Promise<ResolutionQualityFile> {
  const paths = brainPaths(cfg.root);
  const conflicts = await readConflicts(paths);
  const rows: ResolutionQualityRow[] = [];

  for (const c of conflicts.items) {
    if (c.status !== "resolved" && c.status !== "accepted-as-tension") continue;
    const { score, bucket, dimensions } = scoreConflictResolution(c.resolutionNote, c.status);
    rows.push({
      id: c.id,
      kind: "conflict",
      topic: c.topic,
      status: c.status,
      resolutionNote: c.resolutionNote,
      score0to100: score,
      bucket,
      dimensions,
    });
  }

  rows.sort((a, b) => a.score0to100 - b.score0to100);

  const file: ResolutionQualityFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    rows: rows.slice(0, 120),
  };
  await writeResolutionQuality(paths, file);
  return file;
}

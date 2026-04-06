import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";
import type { BrainPaths } from "../paths.js";

export type ResolutionType =
  | "conflict"
  | "unsupported-claim"
  | "drift"
  | "canonical-update"
  | "other";

export interface ResolutionRecord {
  id: string;
  type: ResolutionType;
  relatedIds: string[];
  relatedPagePaths: string[];
  issueSummary: string;
  decision: string;
  rationale: string;
  resolvedBy: "human" | "dashboard" | "cli";
  resolvedAt: string;
  followUp?: string;
  linkedDecisionPath?: string;
  supersededBy?: string;
}

export interface ResolutionsFile {
  version: 1;
  updatedAt: string;
  items: ResolutionRecord[];
}

export async function readResolutions(paths: BrainPaths): Promise<ResolutionsFile> {
  try {
    const raw = await fs.readFile(paths.resolutionsJson, "utf8");
    return JSON.parse(raw) as ResolutionsFile;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), items: [] };
  }
}

export async function writeResolutions(paths: BrainPaths, f: ResolutionsFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.resolutionsJson), { recursive: true });
  await fs.writeFile(
    paths.resolutionsJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

export async function recordResolutionFromDashboard(
  paths: BrainPaths,
  params: {
    type: ResolutionType;
    relatedIds: string[];
    relatedPagePaths: string[];
    issueSummary: string;
    save: { decision: string; rationale: string; followUp?: string; linkedDecisionPath?: string };
  }
): Promise<ResolutionRecord> {
  return addResolution(paths, {
    type: params.type,
    relatedIds: params.relatedIds,
    relatedPagePaths: params.relatedPagePaths,
    issueSummary: params.issueSummary,
    decision: params.save.decision,
    rationale: params.save.rationale,
    resolvedBy: "dashboard",
    followUp: params.save.followUp,
    linkedDecisionPath: params.save.linkedDecisionPath,
  });
}

export async function addResolution(
  paths: BrainPaths,
  input: Omit<ResolutionRecord, "id" | "resolvedAt"> & { id?: string }
): Promise<ResolutionRecord> {
  const f = await readResolutions(paths);
  const rec: ResolutionRecord = {
    ...input,
    id: input.id ?? uuid(),
    resolvedAt: new Date().toISOString(),
  };
  f.items.unshift(rec);
  f.items = f.items.slice(0, 500);
  await writeResolutions(paths, f);
  return rec;
}

export function resolutionsForPage(file: ResolutionsFile, pagePath: string): ResolutionRecord[] {
  const norm = pagePath.replace(/^\//, "");
  return file.items.filter(
    (r) =>
      r.relatedPagePaths.some((p) => p.replace(/^\//, "") === norm) ||
      r.linkedDecisionPath?.replace(/^\//, "") === norm
  );
}

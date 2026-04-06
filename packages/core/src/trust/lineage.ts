import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import matter from "gray-matter";
import { v4 as uuid } from "uuid";
import type { BrainPaths } from "../paths.js";

export type PromptSourceKind =
  | "cli"
  | "dashboard"
  | "template"
  | ".brain/prompts"
  | "unknown";

export interface OutputLineageRecord {
  id: string;
  createdAt: string;
  promptText?: string;
  promptTemplateId?: string;
  promptSource: PromptSourceKind;
  runId?: string;
  action?: string;
  outputRelPath: string;
  sourcePages?: string[];
  sourceRaw?: string[];
  affectedWikiPaths?: string[];
  promotionInboxItemId?: string;
}

function lineagePath(paths: BrainPaths, id: string): string {
  return path.join(paths.lineageDir, `${id}.json`);
}

export async function recordOutputLineage(
  paths: BrainPaths,
  rec: Omit<OutputLineageRecord, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  }
): Promise<OutputLineageRecord> {
  await fs.mkdir(paths.lineageDir, { recursive: true });
  const full: OutputLineageRecord = {
    id: rec.id ?? uuid(),
    createdAt: rec.createdAt ?? new Date().toISOString(),
    promptText: rec.promptText,
    promptTemplateId: rec.promptTemplateId,
    promptSource: rec.promptSource,
    runId: rec.runId,
    action: rec.action,
    outputRelPath: rec.outputRelPath,
    sourcePages: rec.sourcePages,
    sourceRaw: rec.sourceRaw,
    affectedWikiPaths: rec.affectedWikiPaths,
    promotionInboxItemId: rec.promotionInboxItemId,
  };
  await fs.writeFile(
    lineagePath(paths, full.id),
    JSON.stringify(full, null, 2),
    "utf8"
  );
  return full;
}

export async function readOutputLineage(
  paths: BrainPaths,
  id: string
): Promise<OutputLineageRecord | null> {
  try {
    const raw = await fs.readFile(lineagePath(paths, id), "utf8");
    return JSON.parse(raw) as OutputLineageRecord;
  } catch {
    return null;
  }
}

export async function findLineageForOutput(
  paths: BrainPaths,
  outputRel: string
): Promise<OutputLineageRecord | null> {
  try {
    const files = await fs.readdir(paths.lineageDir);
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const raw = await fs.readFile(path.join(paths.lineageDir, f), "utf8");
      const rec = JSON.parse(raw) as OutputLineageRecord;
      if (rec.outputRelPath === outputRel) return rec;
    }
  } catch {
    return null;
  }
  return null;
}

/** Embed lineage id into output markdown frontmatter for quick lookup. */
export async function attachLineageIdToOutputFile(
  absPath: string,
  lineageId: string
): Promise<void> {
  const raw = await fs.readFile(absPath, "utf8");
  const { content, data } = matter(raw);
  const fm = { ...(data as Record<string, unknown>), lineage_id: lineageId };
  await fs.writeFile(absPath, matter.stringify(content, fm), "utf8");
}

export function hashPromptSnippet(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
}

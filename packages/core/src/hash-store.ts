import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { BrainPaths } from "./paths.js";

export type FileHashMap = Record<string, string>;

export async function readHashes(paths: BrainPaths): Promise<FileHashMap> {
  try {
    const raw = await fs.readFile(paths.fileHashesJson, "utf8");
    return JSON.parse(raw) as FileHashMap;
  } catch {
    return {};
  }
}

export async function writeHashes(
  paths: BrainPaths,
  map: FileHashMap
): Promise<void> {
  await fs.mkdir(path.dirname(paths.fileHashesJson), { recursive: true });
  await fs.writeFile(paths.fileHashesJson, JSON.stringify(map, null, 2), "utf8");
}

export function hashContent(buf: string | Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export interface IngestCacheEntry {
  relativePath: string;
  summary: string;
  entities: string[];
  lastIngestedAt: string;
  contentHash: string;
}

export type IngestCache = Record<string, IngestCacheEntry>;

export async function readIngestCache(paths: BrainPaths): Promise<IngestCache> {
  try {
    const raw = await fs.readFile(paths.ingestCacheJson, "utf8");
    return JSON.parse(raw) as IngestCache;
  } catch {
    return {};
  }
}

export async function writeIngestCache(
  paths: BrainPaths,
  cache: IngestCache
): Promise<void> {
  await fs.mkdir(path.dirname(paths.ingestCacheJson), { recursive: true });
  await fs.writeFile(
    paths.ingestCacheJson,
    JSON.stringify(cache, null, 2),
    "utf8"
  );
}

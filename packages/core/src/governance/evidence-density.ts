import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";
import { readWikiTrace } from "../trust/trace.js";
import type { KnowledgeGraph } from "../graph/builder.js";

export type EvidenceDensityBucket = "high" | "moderate" | "low";

export interface EvidenceDensityRow {
  path: string;
  bucket: EvidenceDensityBucket;
  /** Heuristic 0–100 — higher = better grounded (support depth, not truth). */
  score0to100: number;
  reasons: string[];
  sectionWithSources: number;
  sectionTotal: number;
  rawSourceCount: number;
  directSectionRatio: number;
}

export interface EvidenceDensityFile {
  version: 1;
  updatedAt: string;
  pages: EvidenceDensityRow[];
}

export async function readEvidenceDensity(paths: BrainPaths): Promise<EvidenceDensityFile | null> {
  try {
    const raw = await fs.readFile(paths.evidenceDensityJson, "utf8");
    return JSON.parse(raw) as EvidenceDensityFile;
  } catch {
    return null;
  }
}

export async function writeEvidenceDensity(paths: BrainPaths, f: EvidenceDensityFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.evidenceDensityJson), { recursive: true });
  await fs.writeFile(
    paths.evidenceDensityJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

export async function buildEvidenceDensityIndex(
  cfg: BrainConfig,
  wikiRelPaths: string[],
  graph?: KnowledgeGraph | null
): Promise<EvidenceDensityFile> {
  const paths = brainPaths(cfg.root);
  const hub = new Map<string, number>();
  if (graph) for (const n of graph.nodes) hub.set(n.id, n.hubScore);

  const rows: EvidenceDensityRow[] = [];

  for (const rel of wikiRelPaths) {
    const reasons: string[] = [];
    let score = 40;

    const trace = await readWikiTrace(paths, rel);
    const sections = trace?.sections ?? [];
    const total = Math.max(sections.length, 1);
    let withSrc = 0;
    let directN = 0;
    const allSrc: string[] = [];

    for (const s of sections) {
      const n = s.sources?.length ?? 0;
      if (n > 0) withSrc += 1;
      if (s.support === "direct") directN += 1;
      for (const r of s.sources ?? []) {
        if (r.path.startsWith("raw/")) allSrc.push(r.path);
      }
    }

    const coverage = withSrc / total;
    score += Math.round(coverage * 28);
    if (coverage >= 0.6) reasons.push("Most traced sections cite raw paths.");
    else if (coverage < 0.25 && sections.length > 0) {
      score -= 12;
      reasons.push("Many traced sections lack per-section sources.");
    }

    const directRatio = sections.length ? directN / sections.length : 0;
    score += Math.round(directRatio * 12);
    if (directRatio > 0.4) reasons.push("Several sections marked direct (ingest) support.");

    let fmSources: string[] = [];
    try {
      const rawMd = await fs.readFile(path.join(cfg.root, rel), "utf8");
      const { data } = matter(rawMd);
      const fm = data as { sources?: string[] };
      fmSources = Array.isArray(fm.sources) ? fm.sources.filter((x) => typeof x === "string") : [];
    } catch {
      /* skip */
    }

    const rawListed = fmSources.filter((s) => s.startsWith("raw/"));
    const rawCount = Math.max(new Set([...rawListed, ...allSrc]).size, rawListed.length, allSrc.length);
    if (rawCount >= 3) {
      score += 18;
      reasons.push(`Multiple distinct raw sources (${rawCount}+).`);
    } else if (rawCount === 2) {
      score += 10;
      reasons.push("Two raw sources linked.");
    } else if (rawCount === 1) {
      score += 4;
      reasons.push("Single raw source.");
    } else if (!trace?.sections?.length) {
      score -= 18;
      reasons.push("No trace + no listed raw sources — thin grounding.");
    } else {
      score -= 8;
      reasons.push("Limited explicit raw linkage.");
    }

    const h = hub.get(rel) ?? 0;
    if (h > 0.4) {
      score += 6;
      reasons.push("High-link page — density matters for readers.");
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    let bucket: EvidenceDensityBucket = "moderate";
    if (score >= 70) bucket = "high";
    else if (score <= 42) bucket = "low";

    if (reasons.length === 0) reasons.push("Mixed support signals — see trace and sources.");

    rows.push({
      path: rel,
      bucket,
      score0to100: score,
      reasons,
      sectionWithSources: withSrc,
      sectionTotal: sections.length,
      rawSourceCount: rawCount,
      directSectionRatio: Math.round(directRatio * 100) / 100,
    });
  }

  const file: EvidenceDensityFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    pages: rows,
  };
  await writeEvidenceDensity(paths, file);
  return file;
}

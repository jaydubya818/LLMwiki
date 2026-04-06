import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";
import { computePageFreshness } from "./freshness.js";
import { readWikiTrace } from "./trace.js";
import { parseWikiEditPolicy } from "./canonical-lock.js";
import { readUnsupportedClaims } from "./unsupported-claims.js";
import { readConflicts } from "./conflicts.js";
import { readKnowledgeDrift } from "./knowledge-drift.js";
import type { KnowledgeGraph } from "../graph/builder.js";

export type QualityBucket = "high" | "medium" | "low";

export interface PageQualityRow {
  path: string;
  bucket: QualityBucket;
  /** Heuristic 0–100 — see `reasons` for composition. */
  score0to100: number;
  reasons: string[];
}

export interface PageQualityFile {
  version: 1;
  updatedAt: string;
  pages: PageQualityRow[];
}

export async function readPageQuality(paths: BrainPaths): Promise<PageQualityFile | null> {
  try {
    const raw = await fs.readFile(paths.pageQualityJson, "utf8");
    return JSON.parse(raw) as PageQualityFile;
  } catch {
    return null;
  }
}

export async function writePageQuality(paths: BrainPaths, f: PageQualityFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.pageQualityJson), { recursive: true });
  await fs.writeFile(
    paths.pageQualityJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

export async function computePageQualityIndex(
  cfg: BrainConfig,
  wikiRelPaths: string[],
  graph?: KnowledgeGraph | null
): Promise<PageQualityRow[]> {
  const paths = brainPaths(cfg.root);
  const unsupported = await readUnsupportedClaims(paths);
  const conflicts = await readConflicts(paths);
  const drift = await readKnowledgeDrift(paths);

  const unsByPage = new Map<string, number>();
  for (const u of unsupported.items) {
    if (u.status === "resolved" || u.status === "ignored") continue;
    unsByPage.set(u.pagePath, (unsByPage.get(u.pagePath) ?? 0) + 1);
  }
  const driftPages = new Set(
    drift.items.filter((d) => d.status === "new" || d.status === "reviewing").map((d) => d.pagePath)
  );
  const conflictPages = new Set<string>();
  for (const c of conflicts.items) {
    if (c.status === "resolved" || c.status === "ignored") continue;
    conflictPages.add(c.sourceA);
    conflictPages.add(c.sourceB);
    if (c.wikiRef) conflictPages.add(c.wikiRef);
  }

  const inDegree = new Map<string, number>();
  if (graph) {
    for (const n of graph.nodes) inDegree.set(n.id, n.inDegree);
  }

  const rows: PageQualityRow[] = [];
  for (const rel of wikiRelPaths) {
    const reasons: string[] = [];
    let score = 55;

    const fresh = await computePageFreshness(cfg, rel);
    if (fresh.category === "fresh") {
      score += 12;
      reasons.push("Freshness signal: fresh/mixed-positive.");
    } else if (fresh.category === "stale") {
      score -= 15;
      reasons.push("Freshness signal: stale — may need reconciliation.");
    } else if (fresh.category === "unknown") {
      score -= 5;
      reasons.push("Freshness unknown (missing dates or sources list).");
    }

    const trace = await readWikiTrace(paths, rel);
    if (trace?.sections?.length) {
      score += 10;
      reasons.push("Claim trace present.");
    } else {
      score -= 8;
      reasons.push("No claim trace sidecar.");
    }

    let srcN = 0;
    try {
      const raw = await fs.readFile(path.join(cfg.root, rel), "utf8");
      const { data } = matter(raw);
      const fm = data as { sources?: string[] };
      srcN = Array.isArray(fm.sources) ? fm.sources.filter((s) => s.startsWith("raw/")).length : 0;
      const pol = parseWikiEditPolicy(data as Record<string, unknown>);
      if (pol !== "open") {
        score += 5;
        reasons.push("Canonical / manual-review flag — curated.");
      }
    } catch {
      /* skip */
    }

    if (srcN >= 2) {
      score += 12;
      reasons.push(`Two or more raw sources linked (${srcN}).`);
    } else if (srcN === 1) {
      score += 4;
      reasons.push("Single raw source.");
    } else {
      score -= 18;
      reasons.push("No raw sources listed.");
    }

    const inc = inDegree.get(rel) ?? 0;
    if (inc >= 3) {
      score += 10;
      reasons.push(`Inbound wikilinks from graph: ${inc}.`);
    } else if (inc === 0) {
      score -= 6;
      reasons.push("Few or no inbound links (orphan risk).");
    }

    const uc = unsByPage.get(rel) ?? 0;
    if (uc > 0) {
      score -= 12 * uc;
      reasons.push(`Unsupported-claim queue: ${uc} open item(s).`);
    }
    if (driftPages.has(rel)) {
      score -= 12;
      reasons.push("Knowledge drift flag for this page.");
    }
    if (conflictPages.has(rel)) {
      score -= 10;
      reasons.push("Linked to an open conflict record.");
    }

    score = Math.max(0, Math.min(100, score));
    let bucket: QualityBucket = "medium";
    if (score >= 72) bucket = "high";
    else if (score <= 42) bucket = "low";

    rows.push({ path: rel, bucket, score0to100: score, reasons });
  }

  return rows;
}

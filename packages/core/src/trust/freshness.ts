import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { readIngestCache, type IngestCache } from "../hash-store.js";
import fg from "fast-glob";

export type FreshnessCategory = "fresh" | "mixed" | "stale" | "unknown";

export interface PageFreshness {
  category: FreshnessCategory;
  pageLastUpdated?: string;
  newestSourceIngestedAt?: string;
  oldestSourceIngestedAt?: string;
  rawCountReferenced: number;
  explain: string;
}

function parseYm(d?: string): number | null {
  if (!d) return null;
  const t = Date.parse(d.includes("T") ? d : `${d}T12:00:00Z`);
  return Number.isNaN(t) ? null : t;
}

/**
 * Heuristic freshness from frontmatter `last_updated`, `sources`, and ingest cache timestamps.
 * Freshness ≠ truth — only a recency signal.
 */
export async function computePageFreshness(
  cfg: BrainConfig,
  wikiRel: string,
  cache?: IngestCache
): Promise<PageFreshness> {
  const paths = brainPaths(cfg.root);
  const c = cache ?? (await readIngestCache(paths));
  const abs = path.join(cfg.root, wikiRel);
  let sources: string[] = [];
  let pageLastUpdated: string | undefined;
  try {
    const raw = await fs.readFile(abs, "utf8");
    const { data } = matter(raw);
    const fm = data as { last_updated?: string; sources?: string[] };
    pageLastUpdated = fm.last_updated;
    sources = Array.isArray(fm.sources) ? fm.sources : [];
  } catch {
    return {
      category: "unknown",
      rawCountReferenced: 0,
      explain: "Page not found or unreadable.",
    };
  }

  if (sources.length === 0) {
    const ym = parseYm(pageLastUpdated);
    const now = Date.now();
    if (!ym) {
      return {
        category: "unknown",
        pageLastUpdated,
        rawCountReferenced: 0,
        explain: "No `sources` in frontmatter — cannot compare to raw ingest times.",
      };
    }
    const ageDays = (now - ym) / (86400 * 1000);
    if (ageDays < 30) {
      return {
        category: "fresh",
        pageLastUpdated,
        rawCountReferenced: 0,
        explain: "Page recently updated; no source list to cross-check.",
      };
    }
    if (ageDays > 120) {
      return {
        category: "stale",
        pageLastUpdated,
        rawCountReferenced: 0,
        explain: "Page `last_updated` is old and no sources listed.",
      };
    }
    return {
      category: "mixed",
      pageLastUpdated,
      rawCountReferenced: 0,
      explain: "Moderate page age without provenance list.",
    };
  }

  const ingestTimes = sources
    .map((s) => c[s]?.lastIngestedAt)
    .filter(Boolean) as string[];
  let newest: string | undefined;
  let oldest: string | undefined;
  if (ingestTimes.length) {
    const nums = ingestTimes.map((t) => Date.parse(t)).filter((n) => !Number.isNaN(n));
    if (nums.length) {
      const max = new Date(Math.max(...nums)).toISOString();
      const min = new Date(Math.min(...nums)).toISOString();
      newest = max;
      oldest = min;
    }
  }

  const pageT = parseYm(pageLastUpdated);
  const newestT = newest ? Date.parse(newest) : null;
  const now = Date.now();

  let category: FreshnessCategory = "mixed";
  let explain =
    "Compared page `last_updated` to newest ingest time among listed `sources`.";

  if (!pageT || !newestT) {
    category = sources.length && !ingestTimes.length ? "unknown" : "mixed";
    if (!ingestTimes.length) {
      explain =
        "Sources are listed but not found in ingest cache — run ingest or compile incomplete.";
    }
  } else {
    const pageAge = (now - pageT) / (86400 * 1000);
    const skewDays = (pageT - newestT) / (86400 * 1000);
    if (skewDays < -14 && pageAge < 45) {
      category = "stale";
      explain =
        "Page `last_updated` is newer than cached source ingests — may be manual edit without raw refresh.";
    } else if (skewDays > 60) {
      category = "stale";
      explain =
        "New raw material ingested recently but page date lags — synthesis may be behind.";
    } else if (pageAge < 21 && newestT && now - newestT < 21 * 86400 * 1000) {
      category = "fresh";
      explain = "Page and sources both recently touched.";
    } else if (pageAge > 120) {
      category = "stale";
      explain = "Page marked old by `last_updated`.";
    }
  }

  return {
    category,
    pageLastUpdated,
    newestSourceIngestedAt: newest,
    oldestSourceIngestedAt: oldest,
    rawCountReferenced: sources.length,
    explain,
  };
}

export interface DomainFreshnessRollup {
  domain: string;
  wikiCount: number;
  freshCount: number;
  staleCount: number;
  mixedOrUnknown: number;
}

export async function rollupDomainFreshness(
  cfg: BrainConfig,
  domainFolder: string
): Promise<DomainFreshnessRollup> {
  const paths = brainPaths(cfg.root);
  const cache = await readIngestCache(paths);
  const pattern = path.join(paths.wiki, domainFolder, "**/*.md").replace(/\\/g, "/");
  const files = await fg(pattern, { onlyFiles: true });
  let fresh = 0,
    stale = 0,
    mix = 0;
  for (const abs of files) {
    const rel = path.relative(cfg.root, abs).split(path.sep).join("/");
    const f = await computePageFreshness(cfg, rel, cache);
    if (f.category === "fresh") fresh++;
    else if (f.category === "stale") stale++;
    else mix++;
  }
  return {
    domain: domainFolder,
    wikiCount: files.length,
    freshCount: fresh,
    staleCount: stale,
    mixedOrUnknown: mix,
  };
}

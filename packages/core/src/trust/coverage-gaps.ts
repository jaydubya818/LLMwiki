import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { readIngestCache } from "../hash-store.js";
import { extractWikilinks } from "../wiki/wikilinks.js";

export const DEFAULT_DOMAIN_FOLDERS = [
  "work",
  "health",
  "projects",
  "research",
  "decisions",
  "writing",
  "life",
  "goals",
  "people",
  "concepts",
  "systems",
  "topics",
] as const;

export interface DomainCoverageRow {
  domain: string;
  rawCount: number;
  wikiCount: number;
  outputMdCount: number;
  lastRawMtimeMs?: number;
  lastWikiMtimeMs?: number;
  recentIngestCount: number;
  /** Higher = more raw vs wiki (heuristic gap). */
  rawToWikiRatio: number;
  orphanLinkHints: number;
  /** 0-1 heuristic: higher = more likely needs synthesis attention. */
  gapScore: number;
  suggestedActions: string[];
}

async function newestMtime(globs: string[]): Promise<number | undefined> {
  let max: number | undefined;
  for (const pattern of globs) {
    const files = await fg(pattern, { onlyFiles: true, stats: true });
    for (const f of files as { path: string; stats?: { mtimeMs?: number } }[]) {
      const t = f.stats?.mtimeMs;
      if (t != null && (max == null || t > max)) max = t;
    }
  }
  return max;
}

function countRecentIngestForDomain(
  domain: string,
  cache: Record<string, { lastIngestedAt?: string; relativePath?: string }>
): number {
  const week = Date.now() - 7 * 86400 * 1000;
  let n = 0;
  for (const v of Object.values(cache)) {
    const p = v.relativePath ?? "";
    if (!p.startsWith(`raw/${domain}/`) && !p.startsWith(`raw/inbox/`)) continue;
    const t = v.lastIngestedAt ? Date.parse(v.lastIngestedAt) : 0;
    if (t > week) n++;
  }
  return n;
}

/**
 * Approximate "where capture outpaces synthesis" signals per domain folder.
 */
export async function computeDomainCoverage(
  cfg: BrainConfig,
  domainFolders: readonly string[] = DEFAULT_DOMAIN_FOLDERS
): Promise<DomainCoverageRow[]> {
  const paths = brainPaths(cfg.root);
  const cache = await readIngestCache(paths);
  const rows: DomainCoverageRow[] = [];

  const allWikiFiles = await fg(
    path.join(paths.wiki, "**/*.md").replace(/\\/g, "/"),
    { onlyFiles: true }
  );
  const wikiByFolder = new Map<string, string[]>();
  for (const abs of allWikiFiles) {
    const rel = path.relative(cfg.root, abs).split(path.sep).join("/");
    const parts = rel.slice("wiki/".length).split("/");
    const folder = parts[0] ?? "";
    if (!wikiByFolder.has(folder)) wikiByFolder.set(folder, []);
    wikiByFolder.get(folder)!.push(rel);
  }

  const slugSet = new Set<string>();
  for (const abs of allWikiFiles) {
    const base = path.basename(abs, ".md");
    slugSet.add(base.toLowerCase());
  }

  for (const domain of domainFolders) {
    const rawPattern = path.join(paths.raw, domain, "**/*").replace(/\\/g, "/");
    const rawFiles = await fg(rawPattern, { onlyFiles: true });
    const wikiPattern = path.join(paths.wiki, domain, "**/*.md").replace(/\\/g, "/");
    const wikiFiles = await fg(wikiPattern, { onlyFiles: true });
    const outPattern = path.join(paths.outputs, "**/*.md").replace(/\\/g, "/");
    const allOut = await fg(outPattern, { onlyFiles: true });
    let outputMdCount = 0;
    for (const o of allOut) {
      try {
        const raw = await fs.readFile(o, "utf8");
        const { data } = matter(raw);
        const d = data as { domain?: string; tags?: string[] };
        if (d.domain === domain) outputMdCount++;
        else if (
          Array.isArray(d.tags) &&
          d.tags.some((t) => t.toLowerCase() === domain.toLowerCase())
        ) {
          outputMdCount++;
        }
      } catch {
        /* skip */
      }
    }

    const lastRawMtime = await newestMtime([rawPattern]);
    const lastWikiMtime = await newestMtime([wikiPattern]);

    let orphanHints = 0;
    for (const wf of wikiFiles) {
      const body = matter(await fs.readFile(wf, "utf8")).content;
      for (const link of extractWikilinks(body)) {
        const slug = link.split("/").pop()?.toLowerCase() ?? link.toLowerCase();
        if (slug && !slugSet.has(slug.replace(/\.md$/, ""))) orphanHints++;
      }
    }

    const rawCount = rawFiles.length;
    const wikiCount = wikiFiles.length;
    const ratio = wikiCount > 0 ? rawCount / wikiCount : rawCount > 0 ? rawCount : 0;
    const recentIngest = countRecentIngestForDomain(domain, cache);

    const suggested: string[] = [];
    if (rawCount > 8 && wikiCount < 3) {
      suggested.push(`Heavy raw volume (${rawCount}) vs few wiki pages (${wikiCount}) — schedule synthesis pass.`);
    }
    if (lastRawMtime && lastWikiMtime && lastRawMtime > lastWikiMtime + 3 * 86400 * 1000) {
      suggested.push("Raw materials newer than wiki — consider ingest + review for this domain.");
    }
    if (outputMdCount > 5 && wikiCount < outputMdCount / 2) {
      suggested.push("Many outputs vs thin canonical wiki — route strong outputs through Promotion Inbox.");
    }
    if (orphanHints > 5) {
      suggested.push("Several wikilinks lack matching pages — create stubs or fix links.");
    }

    let gapScore = 0;
    gapScore += Math.min(1, ratio / 15);
    if (lastRawMtime && lastWikiMtime && lastRawMtime > lastWikiMtime) gapScore += 0.2;
    gapScore += Math.min(0.3, recentIngest / 20);
    gapScore += Math.min(0.2, orphanHints / 30);
    gapScore = Math.min(1, gapScore);

    rows.push({
      domain,
      rawCount,
      wikiCount,
      outputMdCount,
      lastRawMtimeMs: lastRawMtime,
      lastWikiMtimeMs: lastWikiMtime,
      recentIngestCount: recentIngest,
      rawToWikiRatio: Math.round(ratio * 100) / 100,
      orphanLinkHints: orphanHints,
      gapScore: Math.round(gapScore * 100) / 100,
      suggestedActions: suggested,
    });
  }

  rows.sort((a, b) => b.gapScore - a.gapScore);
  return rows;
}

export interface CoverageGapsSummary {
  weakest: DomainCoverageRow[];
  strongest: DomainCoverageRow[];
  all: DomainCoverageRow[];
}

export function summarizeCoverage(rows: DomainCoverageRow[]): CoverageGapsSummary {
  const byStrength = [...rows].sort(
    (a, b) => a.gapScore - b.gapScore || b.wikiCount - a.wikiCount
  );
  return {
    weakest: rows.slice(0, 5),
    strongest: byStrength.slice(0, 5),
    all: rows,
  };
}

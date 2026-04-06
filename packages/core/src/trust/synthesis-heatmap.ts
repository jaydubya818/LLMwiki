import fs from "node:fs/promises";
import path from "node:path";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";
import { computeDomainCoverage, type DomainCoverageRow } from "./coverage-gaps.js";
import { readPageQuality } from "./page-quality.js";
import { readUnsupportedClaims } from "./unsupported-claims.js";
import { readKnowledgeDrift } from "./knowledge-drift.js";
import { readConflicts } from "./conflicts.js";

export interface HeatmapCell {
  domain: string;
  /** 0–1 higher = more gap / more attention (heuristic). */
  synthesisGap: number;
  rawCount: number;
  wikiCount: number;
  avgQuality?: number;
  unsupportedOpen: number;
  driftOpen: number;
  conflictsOpen: number;
  hint: string;
}

export interface SynthesisHeatmapFile {
  version: 1;
  updatedAt: string;
  cells: HeatmapCell[];
}

export async function readSynthesisHeatmap(paths: BrainPaths): Promise<SynthesisHeatmapFile | null> {
  try {
    const raw = await fs.readFile(paths.synthesisHeatmapJson, "utf8");
    return JSON.parse(raw) as SynthesisHeatmapFile;
  } catch {
    return null;
  }
}

export async function writeSynthesisHeatmap(paths: BrainPaths, f: SynthesisHeatmapFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.synthesisHeatmapJson), { recursive: true });
  const updatedAt = f.updatedAt?.trim() ? f.updatedAt : new Date().toISOString();
  await fs.writeFile(
    paths.synthesisHeatmapJson,
    JSON.stringify({ ...f, updatedAt }, null, 2),
    "utf8"
  );
}

function domainOfWikiPath(p: string): string {
  return p.split("/")[1] ?? "";
}

export async function buildSynthesisHeatmap(cfg: BrainConfig): Promise<SynthesisHeatmapFile> {
  const paths = brainPaths(cfg.root);
  const coverage = await computeDomainCoverage(cfg);
  const pq = await readPageQuality(paths);
  const uns = await readUnsupportedClaims(paths);
  const drift = await readKnowledgeDrift(paths);
  const conf = await readConflicts(paths);

  const qualityByDomain = new Map<string, number[]>();
  for (const row of pq?.pages ?? []) {
    const d = domainOfWikiPath(row.path);
    if (!d) continue;
    const arr = qualityByDomain.get(d) ?? [];
    arr.push(row.score0to100);
    qualityByDomain.set(d, arr);
  }

  const unsByDomain = new Map<string, number>();
  for (const u of uns.items) {
    if (u.status === "resolved" || u.status === "ignored") continue;
    const d = domainOfWikiPath(u.pagePath);
    if (d) unsByDomain.set(d, (unsByDomain.get(d) ?? 0) + 1);
  }
  const driftByDomain = new Map<string, number>();
  for (const x of drift.items) {
    if (x.status === "resolved" || x.status === "ignored") continue;
    const d = domainOfWikiPath(x.pagePath);
    if (d) driftByDomain.set(d, (driftByDomain.get(d) ?? 0) + 1);
  }
  const openConflicts = conf.items.filter(
    (c) =>
      c.status !== "resolved" &&
      c.status !== "ignored" &&
      c.status !== "accepted-as-tension"
  );
  const confCountByDomain = new Map<string, number>();
  for (const c of openConflicts) {
    for (const p of [c.sourceA, c.sourceB, c.wikiRef].filter(Boolean) as string[]) {
      const d = domainOfWikiPath(p);
      if (d) confCountByDomain.set(d, (confCountByDomain.get(d) ?? 0) + 1);
    }
  }

  const cells: HeatmapCell[] = coverage.map((row: DomainCoverageRow) => {
    const scores = qualityByDomain.get(row.domain) ?? [];
    const avgQuality =
      scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : undefined;
    const unsupportedOpen = unsByDomain.get(row.domain) ?? 0;
    const driftOpen = driftByDomain.get(row.domain) ?? 0;
    const domainConf = confCountByDomain.get(row.domain) ?? 0;
    const conflictWeight = Math.min(5, domainConf);

    let synthesisGap =
      row.gapScore * 0.45 +
      (avgQuality != null ? (100 - avgQuality) / 100 : 0.35) * 0.25 +
      Math.min(1, unsupportedOpen / 6) * 0.15 +
      Math.min(1, driftOpen / 4) * 0.1 +
      (conflictWeight / 10) * 0.05;
    synthesisGap = Math.round(synthesisGap * 100) / 100;

    const hint =
      row.suggestedActions[0] ??
      (synthesisGap > 0.55
        ? "Raw or risk signals outpace wiki maturity here."
        : "Relatively balanced.");

    return {
      domain: row.domain,
      synthesisGap,
      rawCount: row.rawCount,
      wikiCount: row.wikiCount,
      avgQuality,
      unsupportedOpen,
      driftOpen,
      conflictsOpen: domainConf,
      hint,
    };
  });

  cells.sort((a, b) => b.synthesisGap - a.synthesisGap);

  const file: SynthesisHeatmapFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    cells,
  };
  await writeSynthesisHeatmap(paths, file);
  return file;
}

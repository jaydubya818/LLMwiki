import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import type { KnowledgeGraph } from "../graph/builder.js";
import { buildSourceLineage } from "./source-lineage.js";
import { scanUnsupportedClaims } from "./unsupported-claims.js";
import { scanConflicts } from "./conflicts.js";
import { scanKnowledgeDrift } from "./knowledge-drift.js";
import { scanOpenLoops } from "./open-loops.js";
import { computePageQualityIndex, writePageQuality, type PageQualityFile } from "./page-quality.js";
import { buildReviewPriorityQueue } from "./review-priority.js";
import { buildSynthesisHeatmap } from "./synthesis-heatmap.js";
import { writeRelationshipHubPages } from "./relationship-hub.js";
import { buildExecutiveSnapshot } from "./executive-snapshot.js";
import { refreshGovernanceArtifacts } from "../governance/refresh-governance.js";
import { refreshExecutiveCurationPass } from "../governance/refresh-executive-curation.js";

export interface OperationalRefreshResult {
  ok: boolean;
  errors: string[];
  wikiPagesScanned: number;
}

export async function refreshOperationalIntelligence(
  cfg: BrainConfig,
  options: { relatedRunId?: string } = {}
): Promise<OperationalRefreshResult> {
  const paths = brainPaths(cfg.root);
  const errors: string[] = [];
  let wikiPagesScanned = 0;

  try {
    await buildSourceLineage(cfg);
  } catch (e) {
    errors.push(`source-lineage: ${String(e)}`);
  }

  try {
    await scanUnsupportedClaims(cfg, { relatedRunId: options.relatedRunId });
  } catch (e) {
    errors.push(`unsupported-claims: ${String(e)}`);
  }

  try {
    await scanConflicts(cfg);
  } catch (e) {
    errors.push(`conflicts: ${String(e)}`);
  }

  try {
    await scanKnowledgeDrift(cfg);
  } catch (e) {
    errors.push(`knowledge-drift: ${String(e)}`);
  }

  try {
    await scanOpenLoops(cfg);
  } catch (e) {
    errors.push(`open-loops: ${String(e)}`);
  }

  let graph: KnowledgeGraph | null = null;
  try {
    const raw = await fs.readFile(paths.graphJson, "utf8");
    graph = JSON.parse(raw) as KnowledgeGraph;
  } catch {
    errors.push("graph.json missing — run `brain compile` or `brain ingest` for relationship hub quality.");
  }

  const wikiFiles = await fg(
    path.join(paths.wiki, "**/*.md").replace(/\\/g, "/"),
    { onlyFiles: true }
  );
  const wikiRelPaths = wikiFiles.map((abs) =>
    path.relative(cfg.root, abs).split(path.sep).join("/")
  );
  wikiPagesScanned = wikiRelPaths.length;

  try {
    const pages = await computePageQualityIndex(cfg, wikiRelPaths, graph);
    const pq: PageQualityFile = {
      version: 1,
      updatedAt: new Date().toISOString(),
      pages,
    };
    await writePageQuality(paths, pq);
  } catch (e) {
    errors.push(`page-quality: ${String(e)}`);
  }

  try {
    await buildReviewPriorityQueue(cfg, graph);
  } catch (e) {
    errors.push(`review-priority: ${String(e)}`);
  }

  try {
    await buildSynthesisHeatmap(cfg);
  } catch (e) {
    errors.push(`synthesis-heatmap: ${String(e)}`);
  }

  if (graph) {
    try {
      await writeRelationshipHubPages(cfg, graph);
    } catch (e) {
      errors.push(`relationship-hub: ${String(e)}`);
    }
  }

  try {
    const gov = await refreshGovernanceArtifacts(cfg, graph, wikiRelPaths);
    errors.push(...gov.errors);
  } catch (e) {
    errors.push(`governance: ${String(e)}`);
  }

  try {
    await buildExecutiveSnapshot(cfg);
  } catch (e) {
    errors.push(`executive-snapshot: ${String(e)}`);
  }

  try {
    const execGov = await refreshExecutiveCurationPass(cfg, wikiRelPaths);
    errors.push(...execGov.errors);
  } catch (e) {
    errors.push(`executive-curation: ${String(e)}`);
  }

  return { ok: errors.length === 0, errors, wikiPagesScanned };
}

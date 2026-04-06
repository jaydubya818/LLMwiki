import fs from "node:fs/promises";
import path from "node:path";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";
import { readDecisionLedger } from "../trust/decision-ledger.js";
import type { KnowledgeGraph } from "../graph/builder.js";
import { readConflicts } from "../trust/conflicts.js";
import { readKnowledgeDrift } from "../trust/knowledge-drift.js";
import { readUnsupportedClaims } from "../trust/unsupported-claims.js";
import { readOpenLoops } from "../trust/open-loops.js";
import { readCanonPromotions } from "./canon-promotions.js";
import { listRuns } from "../runs.js";

export interface DecisionImpactEntry {
  decisionId: string;
  title: string;
  wikiPath: string;
  status: string;
  relatedWikiPages: string[];
  conflicts: { id: string; topic: string }[];
  drift: { id: string; summary: string }[];
  unsupported: { id: string; excerpt: string }[];
  openLoops: { id: string; title: string }[];
  canonPromotions: { id: string; summary: string }[];
  affectedDomains: string[];
  recentRuns: { id: string; summary: string; startedAt: string }[];
}

export interface DecisionImpactFile {
  version: 1;
  updatedAt: string;
  entries: DecisionImpactEntry[];
}

export async function readDecisionImpact(paths: BrainPaths): Promise<DecisionImpactFile | null> {
  try {
    const raw = await fs.readFile(paths.decisionImpactJson, "utf8");
    return JSON.parse(raw) as DecisionImpactFile;
  } catch {
    return null;
  }
}

export async function writeDecisionImpact(paths: BrainPaths, f: DecisionImpactFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.decisionImpactJson), { recursive: true });
  await fs.writeFile(
    paths.decisionImpactJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

function domainOf(rel: string): string {
  const parts = rel.split("/");
  return parts.length > 1 ? (parts[1] ?? "unknown") : "unknown";
}

export async function buildDecisionImpactMap(
  cfg: BrainConfig,
  graph: KnowledgeGraph | null
): Promise<DecisionImpactFile> {
  const paths = brainPaths(cfg.root);
  const ledger = await readDecisionLedger(paths);
  const conflicts = await readConflicts(paths);
  const drift = await readKnowledgeDrift(paths);
  const unsupported = await readUnsupportedClaims(paths);
  const loops = await readOpenLoops(paths);
  const promos = await readCanonPromotions(paths);
  const runs = await listRuns(paths, 30);

  const entries: DecisionImpactEntry[] = [];

  const neighbors = (pageId: string): Set<string> => {
    const out = new Set<string>();
    if (!graph) return out;
    for (const e of graph.edges) {
      if (e.source === pageId && !e.target.startsWith("unresolved:")) out.add(e.target);
      if (e.target === pageId && !e.source.startsWith("unresolved:")) out.add(e.source);
    }
    return out;
  };

  for (const d of ledger.decisions) {
    const wikiPath = d.wikiPath;
    const related = [...neighbors(wikiPath)];
    const relatedSet = new Set([wikiPath, ...related]);

    const affDomains = new Set<string>([domainOf(wikiPath)]);
    for (const r of related) affDomains.add(domainOf(r));

    const openConflict = (c: (typeof conflicts.items)[0]) =>
      c.status !== "resolved" && c.status !== "ignored" && c.status !== "accepted-as-tension";

    entries.push({
      decisionId: d.id,
      title: d.title,
      wikiPath,
      status: d.status,
      relatedWikiPages: related.slice(0, 40),
      conflicts: conflicts.items
        .filter(openConflict)
        .filter(
          (c) =>
            relatedSet.has(c.sourceA) ||
            relatedSet.has(c.sourceB) ||
            (c.wikiRef != null && relatedSet.has(c.wikiRef))
        )
        .map((c) => ({ id: c.id, topic: c.topic })),
      drift: drift.items
        .filter((x) => x.status !== "resolved" && x.status !== "ignored")
        .filter((x) => relatedSet.has(x.pagePath))
        .map((x) => ({ id: x.id, summary: x.summary })),
      unsupported: unsupported.items
        .filter((u) => u.status !== "resolved" && u.status !== "ignored")
        .filter((u) => relatedSet.has(u.pagePath))
        .map((u) => ({ id: u.id, excerpt: u.excerpt.slice(0, 120) })),
      openLoops: loops.items
        .filter((l) => l.status === "open" || l.status === "in-progress")
        .filter((l) => relatedSet.has(l.sourcePath))
        .map((l) => ({ id: l.id, title: l.title })),
      canonPromotions: promos.items
        .filter((p) => p.status !== "rejected")
        .filter(
          (p) =>
            relatedSet.has(p.proposedTargetCanonicalPage) ||
            p.proposedTargetCanonicalPage.includes(path.basename(wikiPath, ".md"))
        )
        .map((p) => ({ id: p.id, summary: p.promotionSummary.slice(0, 120) })),
      affectedDomains: [...affDomains].sort(),
      recentRuns: runs
        .filter(
          (r) =>
            r.changedFiles?.some((f) => relatedSet.has(f)) ||
            r.summary.toLowerCase().includes(path.basename(wikiPath, ".md").toLowerCase())
        )
        .slice(0, 8)
        .map((r) => ({ id: r.id, summary: r.summary, startedAt: r.startedAt })),
    });
  }

  const file: DecisionImpactFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries,
  };
  await writeDecisionImpact(paths, file);
  return file;
}

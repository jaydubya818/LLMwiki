import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";
import { parseWikiEditPolicy } from "../trust/canonical-lock.js";
import type { KnowledgeGraph } from "../graph/builder.js";
import { readExecutiveSnapshot } from "../trust/executive-snapshot.js";
import { readEvidenceChangeAlerts } from "./evidence-change.js";
import { readCanonPromotions } from "./canon-promotions.js";
import { readUnsupportedClaims } from "../trust/unsupported-claims.js";
import { readKnowledgeDrift } from "../trust/knowledge-drift.js";
import { readConflicts } from "../trust/conflicts.js";
import { readDecisionLedger } from "../trust/decision-ledger.js";
import { computePageFreshness } from "../trust/freshness.js";

export type WatchSeverity = "medium" | "high";

export interface CanonDriftWatchRow {
  pagePath: string;
  reasons: string[];
  severity: WatchSeverity;
  /** Flags tying to other governance artifacts */
  links: string[];
}

export interface CanonDriftWatchlistFile {
  version: 1;
  updatedAt: string;
  rows: CanonDriftWatchRow[];
}

export async function readCanonDriftWatchlist(
  paths: BrainPaths
): Promise<CanonDriftWatchlistFile | null> {
  try {
    const raw = await fs.readFile(paths.canonDriftWatchlistJson, "utf8");
    return JSON.parse(raw) as CanonDriftWatchlistFile;
  } catch {
    return null;
  }
}

export async function writeCanonDriftWatchlist(
  paths: BrainPaths,
  f: CanonDriftWatchlistFile
): Promise<void> {
  await fs.mkdir(path.dirname(paths.canonDriftWatchlistJson), { recursive: true });
  await fs.writeFile(paths.canonDriftWatchlistJson, JSON.stringify(f, null, 2), "utf8");
}

export async function buildCanonDriftWatchlist(
  cfg: BrainConfig,
  wikiRelPaths: string[],
  graph: KnowledgeGraph | null
): Promise<CanonDriftWatchlistFile> {
  const paths = brainPaths(cfg.root);
  const exec = await readExecutiveSnapshot(paths);
  const alerts = await readEvidenceChangeAlerts(paths);
  const promos = await readCanonPromotions(paths);
  const uns = await readUnsupportedClaims(paths);
  const drift = await readKnowledgeDrift(paths);
  const conflicts = await readConflicts(paths);
  const ledger = await readDecisionLedger(paths);

  const decisionPaths = new Set(ledger.decisions.map((d) => d.wikiPath));
  const reviewTop = new Set(exec?.reviewTop.map((r) => r.path) ?? []);

  const hubByPath = new Map<string, number>();
  if (graph) for (const n of graph.nodes) hubByPath.set(n.id, n.hubScore);

  const rows: CanonDriftWatchRow[] = [];

  for (const rel of wikiRelPaths) {
    let raw = "";
    try {
      raw = await fs.readFile(path.join(cfg.root, rel), "utf8");
    } catch {
      continue;
    }
    const fm = matter(raw).data as Record<string, unknown>;
    const policy = parseWikiEditPolicy(fm);
    const canonicalFm = fm.canonical === true;
    const locked = policy === "locked" || policy === "manual_review" || canonicalFm;

    const hub = hubByPath.get(rel) ?? 0;
    const execSig = reviewTop.has(rel);
    const decisionLinked = decisionPaths.has(rel);

    if (!locked && hub < 0.28 && !execSig && !decisionLinked) continue;

    const reasons: string[] = [];
    const links: string[] = [];
    let severity: WatchSeverity = "medium";

    if (locked) reasons.push("canonical / manual_review lock");
    if (canonicalFm) reasons.push("canonical frontmatter");
    if (hub >= 0.35) reasons.push("high graph centrality");
    if (execSig) reasons.push("executive review top queue");
    if (decisionLinked) reasons.push("decision ledger page");

    if (
      drift.items.some(
        (d) => d.pagePath === rel && d.status !== "resolved" && d.status !== "ignored"
      )
    ) {
      reasons.push("open drift");
      severity = "high";
      links.push("drift");
    }
    if (
      conflicts.items.some((c) => {
        if (c.status === "resolved" || c.status === "ignored" || c.status === "accepted-as-tension")
          return false;
        return c.sourceA === rel || c.sourceB === rel || c.wikiRef === rel;
      })
    ) {
      reasons.push("open conflict");
      severity = "high";
      links.push("conflicts");
    }
    const uc = uns.items.filter(
      (u) => u.pagePath === rel && u.status !== "resolved" && u.status !== "ignored"
    ).length;
    if (uc > 0) {
      reasons.push(`${uc} unsupported claim(s)`);
      if (uc >= 2) severity = "high";
      links.push("unsupported");
    }
    if (
      promos.items.some(
        (p) =>
          p.proposedTargetCanonicalPage === rel &&
          p.status !== "promoted" &&
          p.status !== "rejected"
      )
    ) {
      reasons.push("pending canon promotion");
      links.push("canon_promotion");
    }

    const fresh = await computePageFreshness(cfg, rel).catch(() => null);
    if (fresh?.category === "stale" || fresh?.category === "mixed") {
      reasons.push(`freshness: ${fresh.category}`);
      links.push("freshness");
    }

    if (
      alerts.alerts.some(
        (a) => a.pagePath === rel && a.status === "new" && a.severity !== "low"
      )
    ) {
      reasons.push("evidence change alert (new)");
      severity = "high";
      links.push("evidence_alert");
    }

    const worthWatch = reasons.length >= 2 || severity === "high";
    if (!worthWatch) continue;

    rows.push({ pagePath: rel, reasons, severity, links });
  }

  rows.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "high" ? -1 : 1;
    return b.reasons.length - a.reasons.length;
  });

  const file: CanonDriftWatchlistFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    rows: rows.slice(0, 100),
  };
  await writeCanonDriftWatchlist(paths, file);
  return file;
}

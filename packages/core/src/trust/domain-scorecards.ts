import type { BrainConfig } from "../config.js";
import { computeDomainCoverage, DEFAULT_DOMAIN_FOLDERS } from "./coverage-gaps.js";
import { rollupDomainFreshness } from "./freshness.js";

export type ScoreBand = "strong" | "ok" | "attention";

export interface DomainScorecard {
  domain: string;
  completeness: ScoreBand;
  freshness: ScoreBand;
  synthesisDepth: ScoreBand;
  linkage: ScoreBand;
  recentActivity: ScoreBand;
  summary: string;
  detailHints: string[];
}

function bandFromRatio(wiki: number, raw: number): ScoreBand {
  if (wiki === 0 && raw === 0) return "ok";
  if (raw > 0 && wiki < 2 && raw > 6) return "attention";
  if (wiki >= 5 || (wiki >= 2 && raw < wiki * 4)) return "strong";
  return "ok";
}

/**
 * Explainable heuristics — not numeric precision.
 */
export async function buildDomainScorecards(
  cfg: BrainConfig,
  domains: readonly string[] = DEFAULT_DOMAIN_FOLDERS
): Promise<DomainScorecard[]> {
  const rows = await computeDomainCoverage(cfg, domains);
  const cards: DomainScorecard[] = [];
  for (const r of rows) {
    const fresh = await rollupDomainFreshness(cfg, r.domain);
    const completeness = bandFromRatio(r.wikiCount, r.rawCount);
    let freshnessBand: ScoreBand = "ok";
    if (r.wikiCount === 0) freshnessBand = "attention";
    else if (fresh.staleCount > fresh.freshCount) freshnessBand = "attention";
    else if (fresh.freshCount > fresh.staleCount * 1.2) freshnessBand = "strong";

    let synthesis: ScoreBand = "ok";
    if (r.rawCount > 10 && r.wikiCount < 4) synthesis = "attention";
    else if (r.wikiCount >= 6 && r.rawToWikiRatio < 2) synthesis = "strong";

    let linkage: ScoreBand = "ok";
    if (r.orphanLinkHints > 8) linkage = "attention";
    else if (r.orphanLinkHints < 3 && r.wikiCount > 0) linkage = "strong";

    let recent: ScoreBand = "ok";
    if (r.recentIngestCount > 3 && r.lastWikiMtimeMs && r.lastRawMtimeMs && r.lastWikiMtimeMs < r.lastRawMtimeMs) {
      recent = "attention";
    } else if (r.recentIngestCount > 0) recent = "strong";

    const hints = [...r.suggestedActions];
    if (hints.length === 0) {
      if (freshnessBand === "strong" && synthesis === "strong") {
        hints.push("Domain looks healthy — maintain weekly cadence.");
      }
    }

    const summary = [
      `${r.domain}: ${r.wikiCount} wiki · ${r.rawCount} raw`,
      r.gapScore > 0.55 ? "likely synthesis gap" : "balanced enough",
    ].join(" — ");

    cards.push({
      domain: r.domain,
      completeness: completeness,
      freshness: freshnessBand,
      synthesisDepth: synthesis,
      linkage,
      recentActivity: recent,
      summary,
      detailHints: hints.length ? hints : [summary],
    });
  }
  return cards;
}

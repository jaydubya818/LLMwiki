import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import type { KnowledgeGraph } from "../graph/builder.js";
import { buildReviewSlaHints } from "./review-sla.js";
import { buildDecisionImpactMap } from "./decision-impact.js";
import { refreshEvidenceChangeAlerts } from "./evidence-change.js";
import { buildResolutionQualityIndex } from "./resolution-quality.js";
import { buildCanonDriftWatchlist } from "./canon-watchlist.js";
import { rebuildReviewSessionQueue } from "./review-session.js";
import { syncHumanReviewIndex } from "./human-review.js";
import { buildEvidenceDensityIndex } from "./evidence-density.js";
import { buildDriftDecisionBridge } from "./drift-decision-bridge.js";
import { scanSourceSupersession } from "./source-supersession.js";
import { buildCanonicalBoard } from "./canonical-board.js";
import { buildCrossSignalCorrelation } from "./cross-signal.js";
import { refreshExecutiveTrustLayer } from "./executive-trust-layer.js";

export async function refreshGovernanceArtifacts(
  cfg: BrainConfig,
  graph: KnowledgeGraph | null,
  wikiRelPaths: string[]
): Promise<{ errors: string[] }> {
  const errors: string[] = [];

  const run = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn();
    } catch (e) {
      errors.push(`${label}: ${String(e)}`);
    }
  };

  await run("review-sla", () => buildReviewSlaHints(cfg));
  await run("decision-impact", () => buildDecisionImpactMap(cfg, graph));
  await run("evidence-change", () => refreshEvidenceChangeAlerts(cfg, wikiRelPaths));
  await run("resolution-quality", () => buildResolutionQualityIndex(cfg));
  await run("canon-drift-watchlist", () => buildCanonDriftWatchlist(cfg, wikiRelPaths, graph));
  await run("review-session", () => rebuildReviewSessionQueue(cfg));

  const paths = brainPaths(cfg.root);
  await run("human-review-index", () => syncHumanReviewIndex(cfg, wikiRelPaths));
  await run("evidence-density", () => buildEvidenceDensityIndex(cfg, wikiRelPaths, graph));
  await run("drift-decision-bridge", () => buildDriftDecisionBridge(paths));
  await run("source-supersession", () => scanSourceSupersession(cfg));
  await run("canonical-board", () => buildCanonicalBoard(cfg, wikiRelPaths, graph));
  await run("cross-signal", () => buildCrossSignalCorrelation(cfg, graph));

  const execTrust = await refreshExecutiveTrustLayer(cfg, graph, {});
  errors.push(...execTrust.errors);

  return { errors };
}

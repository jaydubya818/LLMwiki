import type { BrainConfig } from "../config.js";
import { buildReviewDebtMeter } from "./review-debt.js";
import { appendConfidenceHistorySnapshots } from "./confidence-history.js";
import { buildDecisionSunsetHints } from "./decision-sunset.js";
import { buildStrategicThemes } from "./strategic-themes.js";
import { buildCanonAdmissionReadiness } from "./canon-admission.js";
import { buildCanonCouncil } from "./canon-council.js";

/**
 * Executive / long-horizon governance JSON — runs after core governance + executive snapshot inputs exist.
 */
export async function refreshExecutiveCurationPass(
  cfg: BrainConfig,
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
  await run("review-debt", () => buildReviewDebtMeter(cfg));
  await run("confidence-history", () => appendConfidenceHistorySnapshots(cfg, wikiRelPaths));
  await run("decision-sunset", () => buildDecisionSunsetHints(cfg));
  await run("strategic-themes", () => buildStrategicThemes(cfg));
  await run("canon-admission", () => buildCanonAdmissionReadiness(cfg));
  await run("canon-council", () => buildCanonCouncil(cfg));
  return { errors };
}

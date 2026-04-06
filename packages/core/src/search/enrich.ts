import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { readIngestCache } from "../hash-store.js";
import { computePageFreshness } from "../trust/freshness.js";
import type { SearchHit } from "./query.js";

export type SearchHitWithFreshness = SearchHit & {
  freshness?: { category: string; explain: string };
};

/**
 * Attach freshness (cheap heuristic) to the first N wiki hits only.
 */
export async function enrichSearchHitsWithFreshness(
  cfg: BrainConfig,
  hits: SearchHit[],
  options?: { maxWiki?: number }
): Promise<SearchHitWithFreshness[]> {
  const maxWiki = options?.maxWiki ?? 24;
  const cache = await readIngestCache(brainPaths(cfg.root));
  let wikiN = 0;
  const out: SearchHitWithFreshness[] = [];
  for (const h of hits) {
    if (h.kind !== "wiki" || wikiN >= maxWiki) {
      out.push(h);
      continue;
    }
    const fr = await computePageFreshness(cfg, h.path, cache);
    out.push({
      ...h,
      freshness: { category: fr.category, explain: fr.explain },
    });
    wikiN++;
  }
  return out;
}

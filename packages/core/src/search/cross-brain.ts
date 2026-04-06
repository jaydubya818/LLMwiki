import path from "node:path";
import { brainPaths } from "../paths.js";
import { loadSearchIndex } from "./indexer.js";
import { searchIndex, type SearchHit } from "./query.js";
import { listBrainsWorkspace } from "../workspace/overview.js";

export interface CrossBrainHit {
  brain: string;
  hit: SearchHit;
}

export async function searchAcrossBrains(
  workspaceRoot: string,
  query: string,
  limitPerBrain = 15
): Promise<CrossBrainHit[]> {
  const ws = path.resolve(workspaceRoot);
  const brains = await listBrainsWorkspace(ws);
  const out: CrossBrainHit[] = [];
  for (const b of brains) {
    const paths = brainPaths(b.abs);
    const idx = await loadSearchIndex(paths);
    if (!idx) continue;
    const hits = searchIndex(idx, query, {}, limitPerBrain);
    for (const h of hits) {
      out.push({ brain: b.name, hit: h });
    }
  }
  out.sort((a, b) => b.hit.score - a.hit.score);
  return out;
}

import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { buildKnowledgeGraph } from "../graph/builder.js";
import { buildSearchIndex } from "../search/indexer.js";
import { appendLog } from "../log-append.js";
import { writeRun } from "../runs.js";
import { writeState } from "../state.js";
import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";

/**
 * Rebuilds derived artifacts (graph, search) and records a compile run.
 * Idempotent and safe — does not rewrite wiki prose.
 */
export async function runCompile(cfg: BrainConfig): Promise<{
  wikiPages: number;
}> {
  const paths = brainPaths(cfg.root);
  const pattern = path.join(paths.wiki, "**/*.md").replace(/\\/g, "/");
  const files = await fg(pattern, { onlyFiles: true });

  await buildKnowledgeGraph(cfg);
  await buildSearchIndex(cfg);

  const stamp = new Date().toISOString();
  await appendLog(
    paths,
    `compile: rebuilt graph + search index; wiki markdown files=${files.length}`
  );
  await writeState(paths, { lastCompileAt: stamp });
  await writeRun(paths, {
    kind: "compile",
    ok: true,
    summary: `compile refreshed derived indexes (${files.length} wiki files)`,
    details: { wikiPages: files.length },
  });

  await fs.mkdir(paths.runsDir, { recursive: true });
  await fs.writeFile(
    path.join(paths.runsDir, `compile-summary-${stamp.slice(0, 10)}.json`),
    JSON.stringify({ at: stamp, wikiPages: files.length }, null, 2),
    "utf8"
  );

  return { wikiPages: files.length };
}

import fs from "node:fs/promises";
import path from "node:path";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { loadSearchIndex } from "../search/indexer.js";
import { searchIndex } from "../search/query.js";
import { createLlm } from "../llm/factory.js";
import { appendLog } from "../log-append.js";
import { writeRun } from "../runs.js";
import { recordOutputLineage, attachLineageIdToOutputFile } from "../trust/lineage.js";

export async function runAsk(
  cfg: BrainConfig,
  question: string,
  options: { promote?: boolean } = {}
): Promise<{ answerPath: string; text: string }> {
  const paths = brainPaths(cfg.root);
  const index = await loadSearchIndex(paths);
  if (!index) {
    throw new Error("Search index missing; run `brain ingest` or `brain compile`.");
  }

  const hits = searchIndex(index, question, { kinds: ["wiki", "raw", "output"] }, 12);
  const context = hits
    .map((h) => {
      const doc = index.docs.find((d) => d.path === h.path);
      return doc ? `### ${doc.path}\n${doc.text.slice(0, 3000)}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  const llm = createLlm(cfg);
  let text: string;
  if (llm) {
    text = await llm.completeText(
      "Answer using only the provided context. Cite paths in backticks when referencing sources. If insufficient context, say what is missing.",
      `Question: ${question}\n\nContext:\n${context}`
    );
  } else {
    text = `_(Offline mode — no OPENAI_API_KEY.)_\n\nBased on keyword retrieval:\n\n${hits
      .map((h) => `- \`${h.path}\` (score ${h.score.toFixed(1)}): ${h.preview}`)
      .join("\n")}`;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(paths.outputs, "reports");
  await fs.mkdir(outDir, { recursive: true });
  const base = `answer-${stamp.slice(0, 10)}-${slug(question)}.md`;
  const answerPath = path.join(outDir, base);
  const body = [
    "---",
    `title: Q&A`,
    `question: ${JSON.stringify(question)}`,
    `generated: ${new Date().toISOString()}`,
    "sources:",
    ...hits.map((h) => `  - ${h.path}`),
    "---",
    "",
    text,
    "",
  ].join("\n");
  await fs.writeFile(answerPath, body, "utf8");
  const answerRel = path.relative(cfg.root, answerPath).split(path.sep).join("/");
  const lineage = await recordOutputLineage(paths, {
    promptText: question,
    promptSource: "cli",
    action: "ask",
    outputRelPath: answerRel,
    sourcePages: hits.map((h) => h.path),
    affectedWikiPaths: options.promote
      ? [`wiki/topics/promoted-${slug(question)}.md`]
      : undefined,
  });
  await attachLineageIdToOutputFile(answerPath, lineage.id);

  let promotedRel: string | undefined;
  if (options.promote) {
    const promo = path.join(paths.wiki, "topics", `promoted-${slug(question)}.md`);
    promotedRel = path.relative(cfg.root, promo).split(path.sep).join("/");
    await fs.mkdir(path.dirname(promo), { recursive: true });
    await fs.writeFile(
      promo,
      [
        "---",
        `title: Promoted answer — ${question.slice(0, 60)}`,
        `type: topic`,
        `domain: topics`,
        `last_updated: ${new Date().toISOString().slice(0, 10)}`,
        `sources:`,
        ...hits.map((h) => `  - ${h.path}`),
        `lineage_id: ${lineage.id}`,
        "---",
        "",
        text,
        "",
      ].join("\n"),
      "utf8"
    );
  }

  await appendLog(paths, `ask: saved ${answerRel}`);
  await writeRun(paths, {
    kind: "ask",
    ok: true,
    summary: `ask: ${question.slice(0, 80)}`,
    changedFiles: promotedRel ? [answerRel, promotedRel] : [answerRel],
    inputsConsidered: hits.map((h) => h.path),
    linkedOutputs: [answerRel],
    lineageIds: [lineage.id],
    details: { answerPath: answerRel, lineageId: lineage.id },
  });

  return { answerPath, text };
}

function slug(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

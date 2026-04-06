import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { createLlm } from "../llm/factory.js";
import { appendLog } from "../log-append.js";
import { writeRun } from "../runs.js";
import { recordOutputLineage, attachLineageIdToOutputFile } from "./lineage.js";
import { addInboxItem } from "./promotion-inbox.js";

export interface ComparativeSynthesisResult {
  outputRelPath: string;
  lineageId: string;
}

/**
 * Compare 2–4 wiki pages; write structured markdown to outputs/comparisons/.
 */
export async function runComparativeSynthesis(
  cfg: BrainConfig,
  wikiRels: string[],
  options: { addToPromotionInbox?: boolean; runId?: string } = {}
): Promise<ComparativeSynthesisResult> {
  if (wikiRels.length < 2 || wikiRels.length > 4) {
    throw new Error("Select between 2 and 4 wiki pages.");
  }
  const paths = brainPaths(cfg.root);
  const bodies: string[] = [];
  for (const rel of wikiRels) {
    const abs = path.join(cfg.root, rel);
    const raw = await fs.readFile(abs, "utf8");
    const { content, data } = matter(raw);
    const fm = data as { title?: string };
    bodies.push(`## ${fm.title ?? rel}\nPath: \`${rel}\`\n\n${content.slice(0, 12000)}`);
  }

  const llm = createLlm(cfg);
  const prompt = `You are comparing internal wiki pages. Produce markdown with:
## Common themes
## Differences
## Tensions or contradictions
## Complementary ideas
## Implications
## Recommended next questions
## Source references (use paths in backticks)

Be explicit when evidence is thin.`;

  let mdBody: string;
  if (llm) {
    mdBody = await llm.completeText(
      prompt,
      `Pages to compare:\n\n${bodies.join("\n\n---\n\n")}`
    );
  } else {
    mdBody = [
      "_Offline — no LLM key. Manual scaffold:_",
      "",
      "## Compared paths",
      ...wikiRels.map((p) => `- \`${p}\``),
      "",
      "## Common themes",
      "_Run with OPENAI_API_KEY for synthesis._",
    ].join("\n");
  }

  const ts = new Date().toISOString();
  const slug = wikiRels
    .map((r) => path.basename(r, ".md").slice(0, 20))
    .join("-vs-")
    .slice(0, 80)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");
  const fname = `compare-${ts.slice(0, 10)}-${slug}.md`;
  const outDir = path.join(paths.outputs, "comparisons");
  await fs.mkdir(outDir, { recursive: true });
  const outAbs = path.join(outDir, fname);
  const outRel = path.relative(cfg.root, outAbs).split(path.sep).join("/");

  const fm = [
    "---",
    `title: Comparative synthesis`,
    `kind: comparative_synthesis`,
    `generated: ${ts}`,
    `brain_operation: comparative synthesis`,
    `compared_wiki:`,
    ...wikiRels.map((w) => `  - ${w}`),
    `promotion_candidate: true`,
    `promotion_rationale: Multi-page synthesis; review before canonical merge.`,
    "---",
    "",
    mdBody,
    "",
  ].join("\n");
  await fs.writeFile(outAbs, fm, "utf8");

  const lineage = await recordOutputLineage(paths, {
    promptText: `comparative: ${wikiRels.join(", ")}`,
    promptSource: "cli",
    runId: options.runId,
    action: "comparative-synthesis",
    outputRelPath: outRel,
    sourcePages: wikiRels,
  });
  await attachLineageIdToOutputFile(outAbs, lineage.id);

  if (options.addToPromotionInbox) {
    await addInboxItem(paths, {
      sourcePath: outRel,
      candidateType: "comparative",
      rationale: "Comparative synthesis output",
      suggestedTarget: "wiki/topics/",
      runId: options.runId,
      lineageId: lineage.id,
    });
  }

  await appendLog(paths, `compare: wrote ${outRel}`);
  await writeRun(paths, {
    kind: "output",
    ok: true,
    summary: `comparative synthesis (${wikiRels.length} pages)`,
    changedFiles: [outRel],
    inputsConsidered: wikiRels,
    linkedOutputs: [outRel],
    lineageIds: [lineage.id],
  });

  return { outputRelPath: outRel, lineageId: lineage.id };
}

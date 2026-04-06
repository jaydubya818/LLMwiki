import fs from "node:fs/promises";
import path from "node:path";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { createLlm } from "../llm/factory.js";
import { appendLog } from "../log-append.js";
import { writeRun } from "../runs.js";
import { recordOutputLineage, attachLineageIdToOutputFile } from "../trust/lineage.js";
import { loadSearchIndex } from "../search/indexer.js";
import { searchIndex } from "../search/query.js";

export type OutputKind =
  | "brief"
  | "compare"
  | "project-summary"
  | "research"
  | "decision-memo"
  | "learning-plan"
  | "action-plan"
  | "presentation";

const KIND_FOLDER: Record<OutputKind, string> = {
  brief: "briefs",
  compare: "comparisons",
  "project-summary": "reports",
  research: "reports",
  "decision-memo": "plans",
  "learning-plan": "plans",
  "action-plan": "plans",
  presentation: "presentations",
};

const PROMPTS: Record<OutputKind, string> = {
  brief: "Write an executive brief grounded in context.",
  compare: "Write a structured compare/contrast analysis with criteria.",
  "project-summary": "Summarize project state, risks, next steps.",
  research: "Synthesize research notes into a cohesive overview.",
  "decision-memo": "Draft a decision memo with options and recommendation.",
  "learning-plan": "Draft a learning plan with milestones.",
  "action-plan": "Draft an action plan with owners and sequencing.",
  presentation: "Create a presentation outline (markdown slides).",
};

export async function runStructuredOutput(
  cfg: BrainConfig,
  kind: OutputKind,
  topic: string
): Promise<string> {
  const paths = brainPaths(cfg.root);
  const index = await loadSearchIndex(paths);
  if (!index) throw new Error("Build search index first.");

  const hits = searchIndex(index, topic, {}, 15);
  const context = hits
    .map((h) => {
      const doc = index.docs.find((d) => d.path === h.path);
      return doc ? `### ${doc.path}\n${doc.text.slice(0, 4000)}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  const llm = createLlm(cfg);
  let body: string;
  if (llm) {
    body = await llm.completeText(
      `${PROMPTS[kind]} Use markdown. Cite sources as \`path\` links.`,
      `Topic focus: ${topic}\n\nContext:\n${context}`
    );
  } else {
    body = `_Offline — no LLM key._ Retrieved sources:\n\n${hits
      .map((h) => `- \`${h.path}\``)
      .join("\n")}`;
  }

  const dir = path.join(paths.outputs, KIND_FOLDER[kind]);
  await fs.mkdir(dir, { recursive: true });
  const ts = new Date().toISOString();
  const hhmmss = ts.slice(11, 19).replace(/:/g, "");
  const fname = `${kind}-${ts.slice(0, 10)}-${hhmmss}-${slug(topic)}.md`;
  const full = path.join(dir, fname);
  const md = [
    "---",
    `title: ${kind} — ${topic}`,
    `kind: ${kind}`,
    `generated: ${new Date().toISOString()}`,
    `brain_operation: structured output`,
    `sources:`,
    ...hits.map((h) => `  - ${h.path}`),
    "---",
    "",
    body,
    "",
  ].join("\n");
  await fs.writeFile(full, md, "utf8");
  const outRel = path.relative(cfg.root, full).split(path.sep).join("/");
  const lineage = await recordOutputLineage(paths, {
    promptText: `${PROMPTS[kind]} :: ${topic}`,
    promptTemplateId: `output:${kind}`,
    promptSource: "template",
    action: `output:${kind}`,
    outputRelPath: outRel,
    sourcePages: hits.map((h) => h.path),
  });
  await attachLineageIdToOutputFile(full, lineage.id);
  await appendLog(paths, `output: ${outRel}`);
  await writeRun(paths, {
    kind: "output",
    ok: true,
    summary: `${kind} for ${topic.slice(0, 60)}`,
    changedFiles: [outRel],
    inputsConsidered: hits.map((h) => h.path),
    linkedOutputs: [outRel],
    lineageIds: [lineage.id],
    details: { path: outRel, lineageId: lineage.id },
  });
  return full;
}

function slug(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

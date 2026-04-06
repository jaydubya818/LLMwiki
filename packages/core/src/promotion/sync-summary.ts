import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import { createLlm } from "../llm/factory.js";
import { brainPaths } from "../paths.js";
import { readRegistry } from "../workspace/registry.js";
import { resolveBrainRootAbsolute } from "../workspace/registry.js";
import { listRuns } from "../runs.js";

export async function syncCrossBrainSummary(
  workspaceRoot: string
): Promise<string> {
  const ws = path.resolve(workspaceRoot);
  const reg = await readRegistry(ws);
  const chunks: string[] = [];

  for (const b of reg.brains) {
    if (b.type === "master") continue;
    const root = resolveBrainRootAbsolute(ws, b);
    const paths = brainPaths(root);
    let dash = "";
    let idx = "";
    try {
      dash = await fs.readFile(paths.dashboardMd, "utf8");
    } catch {
      dash = "";
    }
    try {
      idx = await fs.readFile(paths.indexMd, "utf8");
    } catch {
      idx = "";
    }
    const runs = await listRuns(paths, 3);
    chunks.push(
      `### Brain: ${b.name} (${b.type})\n${dash.slice(0, 1500)}\n---\n${idx.slice(0, 800)}\nRuns: ${runs.map((r) => r.summary).join(" | ")}`
    );
  }

  const first = reg.brains[0];
  const llmRoot = first ? resolveBrainRootAbsolute(ws, first) : ws;
  const llm = createLlm(loadConfig(llmRoot));
  const input = chunks.join("\n\n");

  if (!llm) {
    return [
      "# Cross-brain summary (offline)",
      "",
      input.slice(0, 12000),
      "",
      "_Set OPENAI_API_KEY for synthesized overview._",
    ].join("\n");
  }

  return llm.completeText(
    "You produce an executive cross-brain summary: what each agent brain learned, overlaps, duplication risks, and concrete promotion suggestions to master. Markdown with sections.",
    input.slice(0, 24000)
  );
}

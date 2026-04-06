import fs from "node:fs/promises";
import path from "node:path";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { createLlm } from "../llm/factory.js";
import { appendLog } from "../log-append.js";
import { writeRun } from "../runs.js";

export async function runExecutiveReview(cfg: BrainConfig): Promise<string> {
  const paths = brainPaths(cfg.root);
  let dash = "";
  try {
    dash = await fs.readFile(paths.dashboardMd, "utf8");
  } catch {
    dash = "(no dashboard yet)";
  }
  let index = "";
  try {
    index = await fs.readFile(paths.indexMd, "utf8");
  } catch {
    index = "(no index)";
  }

  const llm = createLlm(cfg);
  let md: string;
  if (llm) {
    md = await llm.completeText(
      "Produce a concise executive weekly review in markdown with sections: Snapshot, Wins, Risks, Decisions needed, Suggested next week focus. Ground claims in the provided wiki command center text only.",
      `dashboard.md:\n${dash.slice(0, 8000)}\n\nINDEX.md:\n${index.slice(0, 8000)}`
    );
  } else {
    md = [
      "## Snapshot",
      "_Offline mode — set OPENAI_API_KEY for a synthesized review._",
      "",
      "## Source excerpts",
      dash.slice(0, 2000),
    ].join("\n");
  }

  const dir = path.join(paths.outputs, "reviews");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(
    dir,
    `weekly-${new Date().toISOString().slice(0, 10)}.md`
  );
  const wrapped = [
    "---",
    `title: Weekly executive review`,
    `generated: ${new Date().toISOString()}`,
    "---",
    "",
    md,
    "",
  ].join("\n");
  await fs.writeFile(file, wrapped, "utf8");
  await appendLog(paths, `review: ${path.relative(cfg.root, file)}`);
  await writeRun(paths, {
    kind: "review",
    ok: true,
    summary: "weekly review generated",
    details: { path: path.relative(cfg.root, file) },
  });
  return file;
}

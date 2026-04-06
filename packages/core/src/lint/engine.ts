import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { appendLog } from "../log-append.js";
import { writeRun } from "../runs.js";
import { writeState } from "../state.js";
import type { KnowledgeGraph } from "../graph/builder.js";
import { createLlm } from "../llm/factory.js";

export interface LintFinding {
  severity: "info" | "warn" | "error";
  code: string;
  message: string;
  path?: string;
}

export interface LintReport {
  generatedAt: string;
  findings: LintFinding[];
}

export async function runLint(cfg: BrainConfig): Promise<LintReport> {
  const paths = brainPaths(cfg.root);
  const findings: LintFinding[] = [];

  let graph: KnowledgeGraph | null = null;
  try {
    const raw = await fs.readFile(paths.graphJson, "utf8");
    graph = JSON.parse(raw) as KnowledgeGraph;
  } catch {
    findings.push({
      severity: "warn",
      code: "graph.missing",
      message: "No graph.json yet — run `brain ingest` or `brain graph`.",
    });
  }

  const wikiPattern = path.join(paths.wiki, "**/*.md").replace(/\\/g, "/");
  const wikiFiles = await fg(wikiPattern, { onlyFiles: true });
  const bySummary = new Map<string, string[]>();

  for (const abs of wikiFiles) {
    const rel = path.relative(cfg.root, abs).split(path.sep).join("/");
    const raw = await fs.readFile(abs, "utf8");
    const { content, data } = matter(raw);
    const fm = data as { last_updated?: string; title?: string };
    if (!content.trim().startsWith("#") && !fm.title) {
      findings.push({
        severity: "info",
        code: "page.title",
        message: "Page may be missing a clear title heading.",
        path: rel,
      });
    }
    const firstPara = content.split(/\n\n+/)[0]?.trim() ?? "";
    if (firstPara.length < 80) {
      findings.push({
        severity: "warn",
        code: "page.thin_summary",
        message: "Executive summary paragraph looks thin.",
        path: rel,
      });
    }
    if (fm.last_updated) {
      const age = Date.now() - Date.parse(`${fm.last_updated}T00:00:00Z`);
      const days = age / (86400 * 1000);
      if (days > 120) {
        findings.push({
          severity: "info",
          code: "page.stale",
          message: `Stale page (last_updated ${fm.last_updated}).`,
          path: rel,
        });
      }
    } else {
      findings.push({
        severity: "info",
        code: "page.no_last_updated",
        message: "Missing last_updated in frontmatter.",
        path: rel,
      });
    }

    const key = firstPara.slice(0, 120).toLowerCase().replace(/\s+/g, " ");
    if (key.length > 40) {
      const group = bySummary.get(key) ?? [];
      group.push(rel);
      bySummary.set(key, group);
    }

    if (!/\[\[[^\]]+\]\]/.test(content)) {
      findings.push({
        severity: "info",
        code: "page.no_wikilinks",
        message: "No wikilinks — consider cross-linking.",
        path: rel,
      });
    }

    if (
      /definitely\b|always\b|never\b|impossible\b/i.test(content) &&
      !/Sources\b/i.test(content)
    ) {
      findings.push({
        severity: "warn",
        code: "claim.unsupported_tone",
        message: "Strong claims without an explicit Sources section.",
        path: rel,
      });
    }
  }

  for (const [, group] of bySummary) {
    if (group.length > 1) {
      findings.push({
        severity: "warn",
        code: "duplicate.near",
        message: `Near-duplicate executive summaries: ${group.join(", ")}`,
      });
    }
  }

  if (graph) {
    for (const n of graph.nodes) {
      if (n.orphan && n.kind === "page" && n.relPath) {
        findings.push({
          severity: "warn",
          code: "graph.orphan_page",
          message: `Orphan wiki page (weak inbound links): ${n.label}`,
          path: n.relPath,
        });
      }
    }
    const unresolved = graph.nodes.filter((n) => n.domain === "unresolved");
    for (const u of unresolved.slice(0, 30)) {
      findings.push({
        severity: "info",
        code: "link.unresolved",
        message: `Unresolved wikilink target: ${u.label}`,
      });
    }
  }

  const llm = createLlm(cfg);
  if (llm && wikiFiles.length > 0) {
    try {
      const sample = wikiFiles.slice(0, 6);
      const payload = await Promise.all(
        sample.map(async (abs) => {
          const rel = path.relative(cfg.root, abs).split(path.sep).join("/");
          const t = await fs.readFile(abs, "utf8");
          return `${rel}:\n${t.slice(0, 2000)}`;
        })
      );
      const text = await llm.completeText(
        "You find contradictions between wiki excerpts. Reply as JSON array of {a,b,reason} max 5 items or [].",
        payload.join("\n---\n")
      );
      const parsed = JSON.parse(
        text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim()
      ) as Array<{ a?: string; b?: string; reason?: string }>;
      for (const c of parsed) {
        if (c?.reason) {
          findings.push({
            severity: "warn",
            code: "nlp.possible_contradiction",
            message: `Possible contradiction (${c.a ?? "?"} vs ${c.b ?? "?"}): ${c.reason}`,
          });
        }
      }
    } catch {
      findings.push({
        severity: "info",
        code: "nlp.skipped",
        message: "Contradiction scan skipped (LLM parse error).",
      });
    }
  }

  const report: LintReport = {
    generatedAt: new Date().toISOString(),
    findings,
  };

  const outDir = path.join(paths.outputs, "health-checks");
  await fs.mkdir(outDir, { recursive: true });
  const hhmmss = report.generatedAt.slice(11, 19).replace(/:/g, "");
  const fname = `health-${report.generatedAt.slice(0, 10)}-${hhmmss}.md`;
  const md = renderLintMarkdown(report);
  await fs.writeFile(path.join(outDir, fname), md, "utf8");

  await appendLog(paths, `lint: findings=${findings.length} saved ${fname}`);
  await writeState(paths, { lastLintAt: report.generatedAt });
  await writeRun(paths, {
    kind: "lint",
    ok: true,
    summary: `lint ${findings.length} findings`,
    details: { file: `outputs/health-checks/${fname}` },
  });

  return report;
}

function renderLintMarkdown(report: LintReport): string {
  const lines = [
    "---",
    `title: Wiki health check`,
    `kind: health-check`,
    `generated: ${report.generatedAt}`,
    `findings_count: ${report.findings.length}`,
    "---",
    "",
    "## Findings",
    "",
  ];
  for (const f of report.findings) {
    lines.push(`- **${f.severity.toUpperCase()}** \`${f.code}\` — ${f.message}${f.path ? ` (\`${f.path}\`)` : ""}`);
  }
  return lines.join("\n");
}

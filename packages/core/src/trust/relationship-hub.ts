import fs from "node:fs/promises";
import path from "node:path";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import type { KnowledgeGraph } from "../graph/builder.js";

/**
 * Auto-maintain readable hub markdown from the knowledge graph (People / Projects / Decisions).
 */
export async function writeRelationshipHubPages(
  cfg: BrainConfig,
  graph: KnowledgeGraph
): Promise<{ mainRel: string; aux: string[] }> {
  const paths = brainPaths(cfg.root);
  const aux: string[] = [];

  const byKind = (k: KnowledgeGraph["nodes"][0]["kind"]) =>
    graph.nodes.filter((n) => n.kind === k).sort((a, b) => b.hubScore - a.hubScore);

  const renderTable = (title: string, nodes: typeof graph.nodes) => {
    const lines = [
      `## ${title}`,
      "",
      "| Page | Domain | In | Out | Hub |",
      "|------|--------|----|-----|-----|",
      ...nodes.slice(0, 35).map(
        (n) =>
          `| [[${path.basename(n.relPath, ".md").replace(/]/g, "")}]] | ${n.domain} | ${n.inDegree} | ${n.outDegree} | ${n.hubScore.toFixed(2)} |`
      ),
      "",
    ];
    return lines.join("\n");
  };

  const people = byKind("person");
  const projects = byKind("project");
  const decisions = graph.nodes.filter((n) => n.relPath.includes("/decisions/"));

  const mainBody = [
    "# Relationship hub",
    "",
    `_Generated ${graph.generatedAt} from graph.json — edit by hand only in sections below the fold if you disable regeneration._`,
    "",
    "### How to use",
    "",
    "- **People** and **projects** below are ordered by hub score (local connectivity, not importance).",
    "- **Missing links**: if a person mentions a project only in prose, the graph may not show it — add explicit `[[wikilinks]]` when you want durable relationships.",
    "",
    renderTable("People (graph)", people),
    renderTable("Projects (graph)", projects),
    renderTable("Decision-shaped pages", decisions.slice(0, 25)),
    "",
    "## Cross-links",
    "",
    "- Browse wiki domains from [[INDEX]].",
    "- Trust queues: run operational refresh from dashboard.",
    "",
  ].join("\n");

  await fs.mkdir(path.dirname(paths.relationshipHubMd), { recursive: true });
  await fs.writeFile(paths.relationshipHubMd, mainBody, "utf8");
  const mainRel = path.relative(cfg.root, paths.relationshipHubMd).split(path.sep).join("/");

  const writeIndex = async (folder: string, title: string, nodes: typeof graph.nodes) => {
    const dir = path.join(paths.wiki, folder);
    try {
      await fs.access(dir);
    } catch {
      return;
    }
    const idx = path.join(dir, "INDEX.md");
    const body = [
      `# ${title}`,
      "",
      `_Auto summary · ${new Date().toISOString().slice(0, 10)}_`,
      "",
      ...nodes.slice(0, 40).map((n) => `- [[${path.basename(n.relPath, ".md")}]] — ${n.label} (${n.domain})`),
      "",
    ].join("\n");
    await fs.writeFile(idx, body, "utf8");
    aux.push(path.relative(cfg.root, idx).split(path.sep).join("/"));
  };

  await writeIndex("people", "People index", people);
  await writeIndex("projects", "Projects index", projects);

  return { mainRel, aux };
}

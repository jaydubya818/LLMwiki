import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { extractWikilinks, slugifyWikiName } from "../wiki/wikilinks.js";

export interface GraphNode {
  id: string;
  label: string;
  kind: "page" | "concept" | "person" | "project" | "other";
  domain: string;
  relPath: string;
  inDegree: number;
  outDegree: number;
  orphan: boolean;
  hubScore: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: "wikilink";
}

export interface KnowledgeGraph {
  generatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  bridgesSuggested: Array<{ from: string; to: string; reason: string }>;
}

export async function buildKnowledgeGraph(cfg: BrainConfig): Promise<KnowledgeGraph> {
  const paths = brainPaths(cfg.root);
  const pattern = path.join(paths.wiki, "**/*.md").replace(/\\/g, "/");
  const files = await fg(pattern, { onlyFiles: true });

  const pageBySlug = new Map<string, string>();
  const nodesById = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  for (const abs of files) {
    const rel = path.relative(cfg.root, abs).split(path.sep).join("/");
    const raw = await fs.readFile(abs, "utf8");
    const { content, data } = matter(raw);
    const fm = data as {
      title?: string;
      type?: string;
      domain?: string;
    };
    const domain = path.basename(path.dirname(abs));
    const slug = path.basename(abs, ".md");
    const label = fm.title ?? slug;
    const id = rel;
    pageBySlug.set(slugifyWikiName(slug), id);
    pageBySlug.set(slugifyWikiName(label), id);

    const kind = mapFmType(fm.type);
    nodesById.set(id, {
      id,
      label,
      kind,
      domain: fm.domain ?? domain,
      relPath: rel,
      inDegree: 0,
      outDegree: 0,
      orphan: true,
      hubScore: 0,
    });

    const links = extractWikilinks(content);
    for (const target of links) {
      const targetId = resolveLinkTarget(target, pageBySlug, rel);
      edges.push({ source: id, target: targetId, kind: "wikilink" });
    }
  }

  for (const e of edges) {
    if (!nodesById.has(e.target) && e.target.startsWith("unresolved:")) {
      const label = e.target.replace(/^unresolved:/, "");
      nodesById.set(e.target, {
        id: e.target,
        label,
        kind: "other",
        domain: "unresolved",
        relPath: "",
        inDegree: 0,
        outDegree: 0,
        orphan: true,
        hubScore: 0,
      });
    }
    const src = nodesById.get(e.source);
    const tgt = nodesById.get(e.target);
    if (src) {
      src.outDegree += 1;
      src.hubScore += 1;
    }
    if (tgt) {
      tgt.inDegree += 1;
      tgt.orphan = false;
    }
  }

  for (const n of nodesById.values()) {
    if (n.inDegree === 0 && n.outDegree === 0) n.orphan = true;
    else if (n.inDegree === 0) n.orphan = true;
  }

  const nodes = [...nodesById.values()].sort((a, b) => b.hubScore - a.hubScore);
  const bridgesSuggested = suggestBridges(nodes, edges);

  const graph: KnowledgeGraph = {
    generatedAt: new Date().toISOString(),
    nodes,
    edges,
    bridgesSuggested,
  };

  await fs.mkdir(paths.brain, { recursive: true });
  await fs.writeFile(paths.graphJson, JSON.stringify(graph, null, 2), "utf8");
  return graph;
}

function mapFmType(t?: string): GraphNode["kind"] {
  switch (t) {
    case "person":
      return "person";
    case "project":
      return "project";
    case "concept":
      return "concept";
    default:
      return "page";
  }
}

function resolveLinkTarget(
  target: string,
  slugMap: Map<string, string>,
  _sourceRel: string
): string {
  const slug = slugifyWikiName(target.split("/").pop() ?? target);
  return slugMap.get(slug) ?? `unresolved:${slug}`;
}

function suggestBridges(
  nodes: GraphNode[],
  edges: GraphEdge[]
): KnowledgeGraph["bridgesSuggested"] {
  const edgeKeys = new Set(edges.map((e) => `${e.source}->${e.target}`));
  const hubs = nodes.filter((n) => n.hubScore >= 3).slice(0, 8);
  const orphans = nodes.filter((n) => n.orphan).slice(0, 12);
  const out: KnowledgeGraph["bridgesSuggested"] = [];
  for (const o of orphans) {
    for (const h of hubs) {
      if (o.domain !== h.domain && o.id !== h.id) {
        const key = `${o.id}->${h.id}`;
        if (!edgeKeys.has(key)) {
          out.push({
            from: o.id,
            to: h.id,
            reason: `Potential bridge from orphan domain ${o.domain} to hub in ${h.domain}`,
          });
        }
      }
    }
    if (out.length >= 20) break;
  }
  return out;
}

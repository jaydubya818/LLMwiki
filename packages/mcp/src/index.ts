#!/usr/bin/env node
// MCP SDK + Zod inference hits TS2589 in strict builds; runtime types are validated by the SDK.
// @ts-nocheck
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs/promises";
import fg from "fast-glob";
import dotenv from "dotenv";
import {
  resolveBrainConfig,
  applyEnvToConfig,
  brainPaths,
  loadSearchIndex,
  searchIndex,
  listRuns,
  runIngest,
  runLint,
  runStructuredOutput,
  runDailyVideo,
  buildKnowledgeGraph,
  getWikiStatusFilesForBrain,
  listBrainsWorkspace,
} from "@second-brain/core";
import type { KnowledgeGraph, OutputKind } from "@second-brain/core";

function withBrainContext(cfg, payload) {
  return JSON.stringify(
    {
      activeBrain: cfg.brainName,
      workspaceRoot: cfg.workspaceRoot ?? null,
      ...payload,
    },
    null,
    2
  );
}

async function main() {
  dotenv.config();
  const cfgBase = await resolveBrainConfig({
    explicitBrainRoot: process.env.SECOND_BRAIN_ROOT,
    workspaceRoot: process.env.SECOND_BRAIN_WORKSPACE,
    brainName: process.env.SECOND_BRAIN_NAME,
  });
  dotenv.config({ path: path.join(cfgBase.root, ".env") });
  const cfg = applyEnvToConfig(cfgBase);
  const paths = brainPaths(cfg.root);

  const server = new McpServer({
    name: "second-brain",
    version: "1.0.0",
  });

  server.registerTool(
    "search_brain",
    {
      description:
        "Full-text search. scope: all | wiki | raw | output (default all)",
      inputSchema: {
        query: z.string(),
        scope: z.enum(["all", "wiki", "raw", "output"]).optional(),
      },
    },
    async (args) => {
      const { query, scope } = args;
      const idx = await loadSearchIndex(paths);
      if (!idx) {
        return {
          content: [{ type: "text" as const, text: "Index missing; run ingest." }],
        };
      }
      let kinds: ("wiki" | "raw" | "output")[] | undefined;
      if (scope === "wiki") kinds = ["wiki"];
      else if (scope === "raw") kinds = ["raw"];
      else if (scope === "output") kinds = ["output"];
      else kinds = undefined;
      const hits = searchIndex(idx, query, { kinds }, 20);
      return {
        content: [
          { type: "text" as const, text: withBrainContext(cfg, { hits }) },
        ],
      };
    }
  );

  server.registerTool(
    "read_page",
    {
      description: "Read a file relative to brain root",
      inputSchema: { relativePath: z.string() },
    },
    async (args) => {
      const { relativePath } = args;
      const safe = relativePath.replace(/\.\./g, "");
      const abs = path.join(cfg.root, safe);
      if (!abs.startsWith(path.resolve(cfg.root))) {
        return {
          content: [{ type: "text" as const, text: "Invalid path" }],
          isError: true,
        };
      }
      const text = await fs.readFile(abs, "utf8");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.registerTool(
    "list_wiki_pages",
    {
      description: "List all wiki markdown paths",
      inputSchema: {},
    },
    async () => {
      const pattern = path.join(paths.wiki, "**/*.md").replace(/\\/g, "/");
      const files = await fg(pattern, { onlyFiles: true });
      const rel = files.map((f) =>
        path.relative(cfg.root, f).split(path.sep).join("/")
      );
      return { content: [{ type: "text" as const, text: rel.join("\n") }] };
    }
  );

  server.registerTool(
    "graph_neighbors",
    {
      description: "Edges touching a node id (wiki/... path)",
      inputSchema: { nodeId: z.string() },
    },
    async (args) => {
      const { nodeId } = args;
      let graph: KnowledgeGraph | null = null;
      try {
        graph = JSON.parse(
          await fs.readFile(paths.graphJson, "utf8")
        ) as KnowledgeGraph;
      } catch {
        return {
          content: [{ type: "text" as const, text: "graph.json missing" }],
        };
      }
      const edges = graph.edges.filter(
        (e) => e.source === nodeId || e.target === nodeId
      );
      return {
        content: [{ type: "text" as const, text: withBrainContext(cfg, { edges }) }],
      };
    }
  );

  server.registerTool(
    "recent_changes",
    {
      description: "Git wiki status + latest run records",
      inputSchema: {},
    },
    async () => {
      const files = await getWikiStatusFilesForBrain(cfg);
      const runs = await listRuns(paths, 10);
      return {
        content: [
          {
            type: "text" as const,
            text: withBrainContext(cfg, { wikiFiles: files, runs }),
          },
        ],
      };
    }
  );

  if (cfg.workspaceRoot) {
    server.registerTool(
      "list_brains",
      {
        description:
          "List brains in this workspace (multi-brain mode). Active brain is in each tool response.",
        inputSchema: {},
      },
      async () => {
        const rows = await listBrainsWorkspace(cfg.workspaceRoot);
        return {
          content: [
            {
              type: "text" as const,
              text: withBrainContext(cfg, { workspaceRoot: cfg.workspaceRoot, brains: rows }),
            },
          ],
        };
      }
    );
  }

  server.registerTool(
    "run_ingest",
    {
      description: "Process raw/ into wiki",
      inputSchema: { force: z.boolean().optional() },
    },
    async (args) => {
      const res = await runIngest(cfg, { force: !!args.force });
      return {
        content: [{ type: "text" as const, text: withBrainContext(cfg, res) }],
      };
    }
  );

  server.registerTool(
    "run_lint",
    {
      description: "Wiki health check",
      inputSchema: {},
    },
    async () => {
      const rep = await runLint(cfg);
      return {
        content: [{ type: "text" as const, text: withBrainContext(cfg, rep) }],
      };
    }
  );

  server.registerTool(
    "generate_output",
    {
      description: "Structured markdown output (brief, compare, ...)",
      inputSchema: { kind: z.string(), topic: z.string() },
    },
    async (args) => {
      const file = await runStructuredOutput(
        cfg,
        args.kind as OutputKind,
        args.topic
      );
      return {
        content: [{ type: "text" as const, text: withBrainContext(cfg, { path: file }) }],
      };
    }
  );

  server.registerTool(
    "daily_video_script",
    {
      description: "Generate daily script + log entry",
      inputSchema: {},
    },
    async () => {
      const res = await runDailyVideo(cfg);
      return {
        content: [{ type: "text" as const, text: withBrainContext(cfg, res) }],
      };
    }
  );

  server.registerTool(
    "rebuild_graph",
    {
      description: "Rebuild graph.json from wiki links",
      inputSchema: {},
    },
    async () => {
      await buildKnowledgeGraph(cfg);
      return {
        content: [
          { type: "text" as const, text: withBrainContext(cfg, { status: "graph rebuilt" }) },
        ],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import {
  brainPaths,
  readState,
  listRuns,
  loadSearchIndex,
} from "@second-brain/core";
import fs from "node:fs/promises";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const root = cfg.root;
    const paths = brainPaths(root);
    const [state, runs, index, graphRaw, logTail] = await Promise.all([
      readState(paths),
      listRuns(paths, 8),
      loadSearchIndex(paths),
      fs.readFile(paths.graphJson, "utf8").catch(() => ""),
      fs.readFile(paths.logMd, "utf8").catch(() => ""),
    ]);
    let graphMeta: Record<string, unknown> = {};
    try {
      if (graphRaw) {
        const g = JSON.parse(graphRaw) as { nodes?: unknown[]; edges?: unknown[] };
        graphMeta = {
          nodeCount: g.nodes?.length ?? 0,
          orphans: (g.nodes as { orphan?: boolean }[] | undefined)?.filter(
            (n) => n.orphan
          ).length,
        };
      }
    } catch {
      graphMeta = {};
    }
    const lintHighlights = graphMeta;
    return NextResponse.json({
      root,
      brainName: cfg.brainName,
      workspaceRoot: cfg.workspaceRoot ?? null,
      gitRoot: cfg.gitRoot,
      state,
      runs,
      searchDocs: index?.docs?.length ?? 0,
      graphMeta: lintHighlights,
      logTail: logTail.split("\n").slice(-12).join("\n"),
    });
  } catch (e) {
    return NextResponse.json(
      { error: String(e) },
      { status: 500 }
    );
  }
}

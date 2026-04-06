import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { getServerBrainConfig } from "@/lib/brain";
import { brainPaths } from "@second-brain/core";
import type { KnowledgeGraph } from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const raw = await fs.readFile(paths.graphJson, "utf8");
    const graph = JSON.parse(raw) as KnowledgeGraph;
    return NextResponse.json(graph);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 404 });
  }
}

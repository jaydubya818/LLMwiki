import { NextResponse } from "next/server";
import path from "node:path";
import fg from "fast-glob";
import { getServerBrainConfig } from "@/lib/brain";
import { brainPaths } from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const root = cfg.root;
    const paths = brainPaths(root);
    const pattern = path.join(paths.wiki, "**/*.md").replace(/\\/g, "/");
    const files = await fg(pattern, { onlyFiles: true });
    const rel = files.map((f) => path.relative(root, f).split(path.sep).join("/"));
    return NextResponse.json({ files: rel.sort() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

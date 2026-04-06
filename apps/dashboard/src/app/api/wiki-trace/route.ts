import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { normalizeWikiRepoRel } from "@/lib/safe-repo-path";
import { brainPaths, readWikiTrace } from "@second-brain/core";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("path") ?? "";
    const cfg = await getServerBrainConfig();
    const rel = normalizeWikiRepoRel(cfg, raw);
    if (!rel) {
      return NextResponse.json({ error: "path must be wiki/..." }, { status: 400 });
    }
    const paths = brainPaths(cfg.root);
    const trace = await readWikiTrace(paths, rel);
    return NextResponse.json({ path: rel, trace });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

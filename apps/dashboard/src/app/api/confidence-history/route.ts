import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { brainPaths, readConfidenceHistory, summarizeConfidenceForPage } from "@second-brain/core";

export async function GET(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const { searchParams } = new URL(req.url);
    const pagePath = searchParams.get("path");
    const hist = await readConfidenceHistory(paths);
    if (pagePath) {
      return NextResponse.json({
        path: pagePath,
        ...summarizeConfidenceForPage(hist, pagePath),
      });
    }
    return NextResponse.json(hist ?? { pages: [], version: 1 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

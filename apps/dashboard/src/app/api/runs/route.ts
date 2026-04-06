import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { brainPaths, listRuns } from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const runs = await listRuns(paths, 40);
    return NextResponse.json({ runs });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

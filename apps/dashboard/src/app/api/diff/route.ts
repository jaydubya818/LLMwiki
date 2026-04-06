import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { getWikiDiffForBrain, getWikiStatusFilesForBrain } from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const [patch, files] = await Promise.all([
      getWikiDiffForBrain(cfg),
      getWikiStatusFilesForBrain(cfg),
    ]);
    return NextResponse.json({ patch, files, brainName: cfg.brainName });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

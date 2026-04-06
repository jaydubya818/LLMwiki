import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { brainPaths, readReviewPriority } from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const q = await readReviewPriority(paths);
    return NextResponse.json(q ?? { queue: [], note: "Run operational refresh first." });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { brainPaths, readCanonicalBoard } from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const b = await readCanonicalBoard(paths);
    return NextResponse.json(b ?? { version: 1, items: [], note: "Run operational refresh first." });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

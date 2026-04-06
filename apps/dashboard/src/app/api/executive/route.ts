import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { brainPaths, readExecutiveSnapshot, buildExecutiveSnapshot } from "@second-brain/core";

export async function GET(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const { searchParams } = new URL(req.url);
    if (searchParams.get("refresh") === "1") {
      const snap = await buildExecutiveSnapshot(cfg);
      return NextResponse.json(snap);
    }
    const snap = await readExecutiveSnapshot(paths);
    if (!snap) {
      const built = await buildExecutiveSnapshot(cfg);
      return NextResponse.json(built);
    }
    return NextResponse.json(snap);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

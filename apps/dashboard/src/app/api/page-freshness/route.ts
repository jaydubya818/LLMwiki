import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { computePageFreshness } from "@second-brain/core";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rel = (searchParams.get("path") ?? "").replace(/^\//, "");
    if (!rel) {
      return NextResponse.json({ error: "path required" }, { status: 400 });
    }
    const cfg = await getServerBrainConfig();
    const freshness = await computePageFreshness(cfg, rel);
    return NextResponse.json({ path: rel, freshness });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

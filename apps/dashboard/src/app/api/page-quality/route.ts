import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { brainPaths, readPageQuality } from "@second-brain/core";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const p = searchParams.get("path");
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const pq = await readPageQuality(paths);
    if (!pq) {
      return NextResponse.json({ path: p, row: null, note: "Run operational refresh first." });
    }
    if (p) {
      const row = pq.pages.find((x) => x.path === p) ?? null;
      return NextResponse.json({ path: p, row });
    }
    return NextResponse.json(pq);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

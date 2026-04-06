import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { brainPaths, readEvidenceDensity } from "@second-brain/core";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const p = searchParams.get("path");
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const ed = await readEvidenceDensity(paths);
    if (!ed) {
      return NextResponse.json({ path: p, row: null, note: "Run operational refresh first." });
    }
    if (p) {
      const row = ed.pages.find((x) => x.path === p) ?? null;
      return NextResponse.json({ path: p, row });
    }
    return NextResponse.json(ed);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

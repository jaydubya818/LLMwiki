import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { brainPaths, findLineageForOutput, readOutputLineage } from "@second-brain/core";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const output = searchParams.get("output");
    const id = searchParams.get("id");
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    if (id) {
      const rec = await readOutputLineage(paths, id);
      return NextResponse.json({ lineage: rec });
    }
    if (output) {
      const rec = await findLineageForOutput(paths, output);
      return NextResponse.json({ lineage: rec });
    }
    return NextResponse.json({ error: "output or id required" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

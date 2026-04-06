import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { runIngest, runLint, runCompile } from "@second-brain/core";

export async function POST(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const body = (await req.json()) as { action?: string; force?: boolean };
    const action = body.action;
    switch (action) {
      case "ingest": {
        const r = await runIngest(cfg, { force: !!body.force });
        return NextResponse.json(r);
      }
      case "lint": {
        const r = await runLint(cfg);
        return NextResponse.json({ findings: r.findings.length });
      }
      case "compile": {
        const r = await runCompile(cfg);
        return NextResponse.json(r);
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

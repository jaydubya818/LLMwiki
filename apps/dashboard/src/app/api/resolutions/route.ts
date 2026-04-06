import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import {
  brainPaths,
  readResolutions,
  addResolution,
  type ResolutionType,
} from "@second-brain/core";

export async function GET(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") as ResolutionType | null;
    const page = searchParams.get("page");
    const f = await readResolutions(paths);
    let items = f.items;
    if (type) items = items.filter((x) => x.type === type);
    if (page) {
      const norm = page.replace(/^\//, "");
      items = items.filter(
        (x) =>
          x.relatedPagePaths.some((p) => p.replace(/^\//, "") === norm) ||
          x.linkedDecisionPath?.replace(/^\//, "") === norm
      );
    }
    return NextResponse.json({ ...f, items });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const body = (await req.json()) as {
      type: ResolutionType;
      relatedIds?: string[];
      relatedPagePaths?: string[];
      issueSummary: string;
      decision: string;
      rationale: string;
      followUp?: string;
      linkedDecisionPath?: string;
    };
    if (!body.type || !body.issueSummary || !body.decision || !body.rationale) {
      return NextResponse.json({ error: "type, issueSummary, decision, rationale required" }, { status: 400 });
    }
    const rec = await addResolution(paths, {
      type: body.type,
      relatedIds: body.relatedIds ?? [],
      relatedPagePaths: body.relatedPagePaths ?? [],
      issueSummary: body.issueSummary,
      decision: body.decision,
      rationale: body.rationale,
      resolvedBy: "dashboard",
      followUp: body.followUp,
      linkedDecisionPath: body.linkedDecisionPath,
    });
    return NextResponse.json({ ok: true, item: rec });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

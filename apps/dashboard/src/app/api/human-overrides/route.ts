import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { brainPaths, readHumanOverrides, recordHumanOverride, type HumanOverrideType } from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const f = await readHumanOverrides(paths);
    return NextResponse.json(f);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const body = (await req.json()) as {
      relatedPath?: string;
      overrideType?: HumanOverrideType;
      previousSuggestion?: string;
      humanDecision?: string;
      rationale?: string;
      linkedResolutionId?: string;
      linkedDecisionPath?: string;
    };
    if (!body.relatedPath || !body.overrideType || !body.humanDecision || !body.rationale) {
      return NextResponse.json({ error: "relatedPath, overrideType, humanDecision, rationale required" }, { status: 400 });
    }
    const rec = await recordHumanOverride(paths, {
      relatedPath: body.relatedPath,
      overrideType: body.overrideType,
      previousSuggestion: body.previousSuggestion,
      humanDecision: body.humanDecision,
      rationale: body.rationale,
      linkedResolutionId: body.linkedResolutionId,
      linkedDecisionPath: body.linkedDecisionPath,
      autoCaptured: false,
      sourceWorkflow: "other",
    });
    return NextResponse.json({ ok: true, rec });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import {
  brainPaths,
  readDecisionSunset,
  updateDecisionSunsetStatus,
  readGovernanceSettings,
  captureGovernanceIntent,
  type DecisionSunsetStatus,
} from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const f = await readDecisionSunset(paths);
    return NextResponse.json(f ?? { hints: [], version: 1 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const body = (await req.json()) as {
      id?: string;
      status?: DecisionSunsetStatus;
      rationale?: string;
    };
    if (!body.id || !body.status) {
      return NextResponse.json({ error: "id and status required" }, { status: 400 });
    }
    const before = (await readDecisionSunset(paths))?.hints.find((h) => h.id === body.id);
    const rec = await updateDecisionSunsetStatus(paths, body.id, body.status);
    if (!rec) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (before && before.status !== rec.status) {
      const settings = await readGovernanceSettings(paths);
      const rat = String(body.rationale ?? "").trim();
      await captureGovernanceIntent(
        cfg,
        {
          relatedPath: rec.decisionWikiPath.replace(/^\//, ""),
          overrideType: "decision_sunset_review",
          sourceWorkflow: "decision_sunset",
          actionTaken: `sunset:${before.status}->${rec.status}`,
          finalHumanDecision: rec.status,
          previousSuggestion: before.summary,
          rationale: rat || undefined,
          autoCaptured: !rat,
          relatedItemType: "decision_sunset",
          relatedItemId: rec.id,
        },
        settings
      );
    }
    return NextResponse.json({ ok: true, rec });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

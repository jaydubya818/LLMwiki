import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { internalServerError, requireDashboardApiKey, parseJsonBody } from "@/lib/api-route-helpers";
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
    return internalServerError(e);
  }
}

export async function POST(req: Request) {
  try {
    const unauthorized = requireDashboardApiKey(req);
    if (unauthorized) return unauthorized;
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const parsed = await parseJsonBody<{ id?: string; status?: DecisionSunsetStatus; rationale?: string }>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    if (!body.id || !body.status) {
      return NextResponse.json({ error: "id and status required" }, { status: 400 });
    }
    const { rec, before } = await updateDecisionSunsetStatus(paths, body.id, body.status);
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
    return internalServerError(e);
  }
}

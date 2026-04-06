import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { parseJsonBody, internalServerError } from "@/lib/api-route-helpers";
import { brainPaths, readHumanOverrides, recordHumanOverride, type HumanOverrideType } from "@second-brain/core";

const VALID_OVERRIDE_TYPES = new Set<string>([
  "reject_synthesis",
  "conflict_resolution",
  "manual_canon_edit",
  "reject_canon_promotion",
  "curated_section",
  "priority_override",
  "merge_supersession_override",
  "canon_admission_override",
  "drift_resolution",
  "unsupported_claim_review",
  "decision_sunset_review",
  "canon_council_action",
  "review_session_note",
  "other",
]);

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const f = await readHumanOverrides(paths);
    return NextResponse.json(f);
  } catch (e) {
    return internalServerError(e);
  }
}

export async function POST(req: Request) {
  try {
    const parsed = await parseJsonBody<{
      relatedPath?: string;
      overrideType?: string;
      previousSuggestion?: string;
      humanDecision?: string;
      rationale?: string;
      linkedResolutionId?: string;
      linkedDecisionPath?: string;
    }>(req);
    if (!parsed.ok) return parsed.response;

    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const body = parsed.data;
    if (!body.relatedPath || !body.overrideType || !body.humanDecision || !body.rationale) {
      return NextResponse.json({ error: "relatedPath, overrideType, humanDecision, rationale required" }, { status: 400 });
    }
    if (!VALID_OVERRIDE_TYPES.has(body.overrideType)) {
      return NextResponse.json({ error: "Invalid overrideType" }, { status: 400 });
    }
    const rec = await recordHumanOverride(paths, {
      relatedPath: body.relatedPath,
      overrideType: body.overrideType as HumanOverrideType,
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
    return internalServerError(e);
  }
}

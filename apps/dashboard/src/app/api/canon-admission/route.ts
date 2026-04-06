import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { internalServerError, requireDashboardApiKey, parseJsonBody } from "@/lib/api-route-helpers";
import {
  brainPaths,
  readCanonAdmission,
  patchCanonAdmissionRecord,
  readGovernanceSettings,
  captureGovernanceIntent,
  isCanonAdmissionBlocked,
  inferGovernanceIntentNeedsRationale,
} from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const f = await readCanonAdmission(paths);
    return NextResponse.json(f ?? { records: [], version: 1 });
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
    const parsed = await parseJsonBody<{
      id?: string;
      reviewerNote?: string;
      rationale?: string;
      finalDecision?: "ready" | "not_ready" | "deferred";
      appendCouncilMinutes?: { title?: string; lines?: string[]; followUp?: string };
      minutesAsSessionFile?: boolean;
    }>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const admissionData = await readCanonAdmission(paths);
    const existing = admissionData?.records?.find((r) => r.id === body.id);
    const settings = await readGovernanceSettings(paths);
    const rationale = String(body.rationale ?? body.reviewerNote ?? "").trim();

    if (
      existing &&
      body.finalDecision !== undefined &&
      body.finalDecision !== existing.finalDecision
    ) {
      const blockedOverride = body.finalDecision === "ready" && isCanonAdmissionBlocked(existing);
      if (
        inferGovernanceIntentNeedsRationale(settings, {
          rationale,
          sourceWorkflow: "canon_admission",
          relatedPath: existing.targetPage,
          overrideType: blockedOverride ? "canon_admission_override" : "other",
          canonAdmissionOverride: blockedOverride,
        })
      ) {
        return NextResponse.json(
          { error: "rationale required for this admission decision", needsRationale: true },
          { status: 400 }
        );
      }
    }

    const rec = await patchCanonAdmissionRecord(paths, body.id, {
      reviewerNote: body.reviewerNote,
      finalDecision: body.finalDecision,
      lastReviewedAt: new Date().toISOString(),
      lastGovernanceAction: body.finalDecision
        ? `finalDecision:${body.finalDecision}`
        : undefined,
    });
    if (!rec) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (existing && body.finalDecision && existing.finalDecision !== body.finalDecision) {
      await captureGovernanceIntent(
        cfg,
        {
          relatedPath: existing.targetPage,
          overrideType:
            body.finalDecision === "ready" && isCanonAdmissionBlocked(existing)
              ? "canon_admission_override"
              : "other",
          sourceWorkflow: "canon_admission",
          actionTaken: `admission:${existing.finalDecision ?? "unset"}->${body.finalDecision}`,
          finalHumanDecision: body.finalDecision,
          previousSuggestion: `readiness=${existing.readinessSummary ?? "unknown"}`,
          rationale: rationale || undefined,
          autoCaptured: !rationale,
          relatedItemType: "canon_admission",
          relatedItemId: existing.id,
          linkedSnapshotId: existing.linkedSnapshotId,
          canonAdmissionOverride:
            body.finalDecision === "ready" && isCanonAdmissionBlocked(existing),
          appendCouncilMinutes: body.appendCouncilMinutes
            ? {
                title: String(body.appendCouncilMinutes.title ?? "Canon admission"),
                lines:
                  body.appendCouncilMinutes.lines ??
                  [`- Record \`${existing.id}\` · ${existing.targetPage}`, `- → ${body.finalDecision}`],
                followUp: body.appendCouncilMinutes.followUp,
              }
            : undefined,
          minutesAsSessionFile: body.minutesAsSessionFile === true,
        },
        settings
      );
    }

    return NextResponse.json({ ok: true, rec });
  } catch (e) {
    return internalServerError(e);
  }
}

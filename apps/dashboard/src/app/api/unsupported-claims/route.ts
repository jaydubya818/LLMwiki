import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { parseJsonBody } from "@/lib/api-route-helpers";
import {
  brainPaths,
  readUnsupportedClaims,
  updateUnsupportedClaim,
  recordResolutionFromDashboard,
  readGovernanceSettings,
  captureGovernanceIntent,
  type UnsupportedClaimStatus,
} from "@second-brain/core";

const VALID_STATUSES: UnsupportedClaimStatus[] = ["new", "reviewing", "resolved", "ignored"];

function isUnsupportedClaimStatus(s: string): s is UnsupportedClaimStatus {
  return (VALID_STATUSES as string[]).includes(s);
}

export async function GET(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const f = await readUnsupportedClaims(paths);
    const items = status ? f.items.filter((i) => i.status === status) : f.items;
    return NextResponse.json({ ...f, items });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const parsed = await parseJsonBody<{
      id?: string;
      status?: string;
      saveResolution?: {
        decision: string;
        rationale: string;
        followUp?: string;
        linkedDecisionPath?: string;
      };
    }>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    if (!body.id || !body.status) {
      return NextResponse.json({ error: "id and status required" }, { status: 400 });
    }
    if (!isUnsupportedClaimStatus(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    const prev = (await readUnsupportedClaims(paths)).items.find((x) => x.id === body.id);
    const item = await updateUnsupportedClaim(paths, body.id, {
      status: body.status,
    });
    let resolutionId: string | undefined;
    if (
      item &&
      prev &&
      body.saveResolution &&
      (item.status === "resolved" || item.status === "ignored")
    ) {
      const res = await recordResolutionFromDashboard(paths, {
        type: "unsupported-claim",
        relatedIds: [prev.id],
        relatedPagePaths: [prev.pagePath],
        issueSummary: `${prev.reason} — ${(prev.excerpt ?? "").slice(0, 120)}`,
        save: body.saveResolution,
      });
      resolutionId = res.id;
    }
    if (item && prev && prev.status !== item.status) {
      const settings = await readGovernanceSettings(paths);
      const rat = (body.saveResolution?.rationale ?? "").trim();
      await captureGovernanceIntent(
        cfg,
        {
          relatedPath: prev.pagePath.replace(/^\//, ""),
          overrideType: "unsupported_claim_review",
          sourceWorkflow: "unsupported_claim",
          actionTaken: `unsupported:${prev.status}->${item.status}`,
          finalHumanDecision: item.status,
          previousSuggestion: `${prev.reason} — ${(prev.excerpt ?? "").slice(0, 160)}`,
          rationale: rat || undefined,
          autoCaptured: !rat,
          relatedItemType: "unsupported_claim",
          relatedItemId: prev.id,
          linkedResolutionId: resolutionId,
        },
        settings
      );
    }
    return NextResponse.json({ ok: !!item, item });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

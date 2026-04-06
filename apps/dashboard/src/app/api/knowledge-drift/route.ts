import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import {
  parseJsonBody,
} from "@/lib/api-route-helpers";
import {
  brainPaths,
  readKnowledgeDrift,
  updateDriftItem,
  recordResolutionFromDashboard,
  readGovernanceSettings,
  captureGovernanceIntent,
  type DriftStatus,
} from "@second-brain/core";

const DRIFT_STATUSES: DriftStatus[] = ["new", "reviewing", "resolved", "ignored"];

function isDriftStatus(s: string): s is DriftStatus {
  return (DRIFT_STATUSES as string[]).includes(s);
}

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    return NextResponse.json(await readKnowledgeDrift(paths));
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
    if (!isDriftStatus(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    const prev = (await readKnowledgeDrift(paths)).items.find((x) => x.id === body.id);
    const item = await updateDriftItem(paths, body.id, {
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
        type: "drift",
        relatedIds: [prev.id],
        relatedPagePaths: [prev.pagePath],
        issueSummary: prev.summary,
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
          overrideType: "drift_resolution",
          sourceWorkflow: "drift",
          actionTaken: `drift:${prev.status}->${item.status}`,
          finalHumanDecision: item.status,
          previousSuggestion: prev.summary,
          rationale: rat || undefined,
          autoCaptured: !rat,
          relatedItemType: "knowledge_drift",
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

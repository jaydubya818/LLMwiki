import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { parseJsonBody } from "@/lib/api-route-helpers";
import {
  brainPaths,
  readConflicts,
  updateConflict,
  appendConflictResolutionNote,
  recordResolutionFromDashboard,
  readGovernanceSettings,
  captureGovernanceIntent,
  type ConflictStatus,
} from "@second-brain/core";

const ALLOWED_CONFLICT_STATUSES: ConflictStatus[] = [
  "new",
  "reviewing",
  "resolved",
  "accepted-as-tension",
  "ignored",
];

function isConflictStatus(s: string): s is ConflictStatus {
  return (ALLOWED_CONFLICT_STATUSES as string[]).includes(s);
}

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    return NextResponse.json(await readConflicts(paths));
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
      action?: string;
      id?: string;
      status?: string;
      resolutionNote?: string;
      targetWikiRel?: string;
      saveResolution?: {
        decision: string;
        rationale: string;
        followUp?: string;
        linkedDecisionPath?: string;
      };
    }>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    if (body.action === "append-note" && body.id && body.resolutionNote) {
      await appendConflictResolutionNote(cfg, body.id, body.resolutionNote, body.targetWikiRel);
      return NextResponse.json({ ok: true });
    }
    if (body.id && body.status) {
      if (!isConflictStatus(body.status)) {
        return NextResponse.json({ error: "invalid status" }, { status: 400 });
      }
      const validatedStatus = body.status;
      const before = (await readConflicts(paths)).items.find((x) => x.id === body.id);
      const item = await updateConflict(paths, body.id, {
        status: validatedStatus,
        resolutionNote: body.resolutionNote,
      });
      let resolutionId: string | undefined;
      if (
        item &&
        body.saveResolution &&
        before &&
        (item.status === "resolved" ||
          item.status === "accepted-as-tension" ||
          item.status === "ignored")
      ) {
        const pages = [before.sourceA, before.sourceB, before.wikiRef].filter(
          (x): x is string => !!x
        );
        const res = await recordResolutionFromDashboard(paths, {
          type: "conflict",
          relatedIds: [before.id],
          relatedPagePaths: pages,
          issueSummary: `${before.topic ?? "(no topic)"}: ${(before.summary ?? "").slice(0, 200)}`,
          save: body.saveResolution,
        });
        resolutionId = res.id;
      }
      if (item && before && before.status !== item.status) {
        const settings = await readGovernanceSettings(paths);
        const rel = (before.wikiRef ?? before.sourceA ?? before.sourceB).replace(/^\//, "");
        const rat = (body.saveResolution?.rationale ?? body.resolutionNote ?? "").trim();
        await captureGovernanceIntent(
          cfg,
          {
            relatedPath: rel,
            overrideType: "conflict_resolution",
            sourceWorkflow: "conflict",
            actionTaken: `conflict:${before.status}->${item.status}`,
            finalHumanDecision: item.status,
            previousSuggestion: `${before.topic}: ${(before.summary ?? "").slice(0, 280)}`,
            rationale: rat || undefined,
            autoCaptured: !rat,
            relatedItemType: "conflict",
            relatedItemId: before.id,
            linkedResolutionId: resolutionId,
          },
          settings
        );
      }
      return NextResponse.json({ ok: !!item, item });
    }
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

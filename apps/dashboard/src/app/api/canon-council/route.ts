import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { requireDashboardApiKey } from "@/lib/api-route-helpers";
import {
  brainPaths,
  readCanonCouncil,
  recordPageSnapshot,
  readGovernanceSettings,
  captureGovernanceIntent,
  appendCouncilMinutesRolling,
  writeCouncilMinutesSessionFile,
} from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const c = await readCanonCouncil(paths);
    return NextResponse.json(c ?? { error: "missing — run operational refresh", items: [] });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const unauthorized = requireDashboardApiKey(req);
    if (unauthorized) return unauthorized;
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "page-snapshot") {
      const r = await recordPageSnapshot(
        cfg,
        String(body.pagePath ?? ""),
        typeof body.reason === "string" ? body.reason : "canon-council",
        undefined
      );
      return NextResponse.json({ ok: true, ...r });
    }

    if (action === "mark-reviewed") {
      const settings = await readGovernanceSettings(paths);
      const pathRel = String(body.path ?? "");
      const rationale = typeof body.rationale === "string" ? body.rationale : "";
      const cap = await captureGovernanceIntent(
        cfg,
        {
          relatedPath: pathRel,
          overrideType: "canon_council_action",
          sourceWorkflow: "canon_council",
          actionTaken: String(body.result ?? "reviewed"),
          finalHumanDecision: String(body.result ?? "reviewed"),
          rationale: rationale.trim() || undefined,
          autoCaptured: !rationale.trim(),
          relatedItemType: typeof body.kind === "string" ? body.kind : "canon_council_row",
          relatedItemId: typeof body.id === "string" ? body.id : undefined,
          appendCouncilMinutes:
            body.appendCouncilMinutes && typeof body.appendCouncilMinutes === "object"
              ? {
                  title: String((body.appendCouncilMinutes as Record<string, unknown>).title ?? "Canon council"),
                  lines: (Array.isArray((body.appendCouncilMinutes as Record<string, unknown>).lines)
                    ? ((body.appendCouncilMinutes as Record<string, unknown>).lines as string[])
                    : [
                        `- Item ${String(body.id ?? "")} (${String(body.kind ?? "")})`,
                        `- Path: \`${pathRel}\``,
                        `- Result: ${String(body.result ?? "reviewed")}`,
                      ]) as string[],
                  followUp: (body.appendCouncilMinutes as Record<string, unknown>).followUp as
                    | string
                    | undefined,
                }
              : undefined,
          minutesAsSessionFile: body.minutesAsSessionFile === true,
        },
        settings
      );
      if (cap.needsRationale) {
        return NextResponse.json({ error: "rationale required", needsRationale: true }, { status: 400 });
      }
      return NextResponse.json({ ok: true, overrideId: cap.override?.id, minutesPath: cap.minutesPath });
    }

    if (action === "write-minutes") {
      const settings = await readGovernanceSettings(paths);
      const title = String(body.title ?? "Canon council minutes");
      const lines = Array.isArray(body.lines) ? (body.lines as string[]) : [];
      const followUp = typeof body.followUp === "string" ? body.followUp : undefined;
      const asSession = body.sessionFile === true || settings.councilMinutesMode === "session";
      const rel = asSession
        ? await writeCouncilMinutesSessionFile(cfg, { title, lines, followUp })
        : await appendCouncilMinutesRolling(cfg, { title, lines, followUp });
      return NextResponse.json({ ok: true, path: rel });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

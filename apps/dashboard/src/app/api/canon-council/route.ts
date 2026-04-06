import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { requireDashboardApiKey, internalServerError } from "@/lib/api-route-helpers";
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
    return internalServerError(e);
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
      const defaultMinuteLines = [
        `- Item ${String(body.id ?? "")} (${String(body.kind ?? "")})`,
        `- Path: \`${pathRel}\``,
        `- Result: ${String(body.result ?? "reviewed")}`,
      ];
      const appendRaw =
        body.appendCouncilMinutes && typeof body.appendCouncilMinutes === "object"
          ? (body.appendCouncilMinutes as Record<string, unknown>)
          : undefined;
      let councilLines = defaultMinuteLines;
      if (appendRaw && Array.isArray(appendRaw.lines)) {
        const filtered = appendRaw.lines.filter((e): e is string => typeof e === "string");
        if (filtered.length > 0) councilLines = filtered;
      }
      let councilFollowUp: string | undefined;
      if (appendRaw) {
        const fu = appendRaw.followUp;
        if (typeof fu === "string") councilFollowUp = fu;
        else if (typeof fu === "number" || typeof fu === "boolean") councilFollowUp = String(fu);
      }
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
          appendCouncilMinutes: appendRaw
            ? {
                title: String(appendRaw.title ?? "Canon council"),
                lines: councilLines,
                followUp: councilFollowUp,
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
      if (
        body.lines !== undefined &&
        (!Array.isArray(body.lines) || !body.lines.every((el) => typeof el === "string"))
      ) {
        return NextResponse.json({ error: "lines must be an array of strings" }, { status: 400 });
      }
      const lines = Array.isArray(body.lines) ? body.lines : [];
      const followUp = typeof body.followUp === "string" ? body.followUp : undefined;
      const asSession = body.sessionFile === true || settings.councilMinutesMode === "session";
      const rel = asSession
        ? await writeCouncilMinutesSessionFile(cfg, { title, lines, followUp })
        : await appendCouncilMinutesRolling(cfg, { title, lines, followUp });
      return NextResponse.json({ ok: true, path: rel });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return internalServerError(e);
  }
}

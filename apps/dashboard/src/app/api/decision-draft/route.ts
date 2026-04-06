import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { parseJsonBody } from "@/lib/api-route-helpers";
import {
  buildDecisionDraftPreview,
  writeDecisionDraftFromPreview,
} from "@second-brain/core";

export async function POST(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const parsed = await parseJsonBody<{
      action?: "preview" | "write";
      sourcePath?: string;
      slugHint?: string;
    }>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const sourcePath = body.sourcePath?.trim().replace(/^\//, "");
    if (!sourcePath) {
      return NextResponse.json({ error: "sourcePath required (raw/... or outputs/...)" }, { status: 400 });
    }
    const action = body.action ?? "preview";
    const preview = await buildDecisionDraftPreview(cfg, sourcePath, {
      slugHint: body.slugHint,
    });
    if (action === "preview") {
      return NextResponse.json({ ok: true, wikiRel: preview.wikiRel, markdown: preview.markdown });
    }
    if (action === "write") {
      const written = await writeDecisionDraftFromPreview(cfg, preview);
      return NextResponse.json({ ok: true, wikiRel: written });
    }
    return NextResponse.json({ error: "action must be preview or write" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

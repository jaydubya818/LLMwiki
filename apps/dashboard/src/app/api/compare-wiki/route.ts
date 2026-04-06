import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { runComparativeSynthesis } from "@second-brain/core";
import { internalServerError, parseJsonBody } from "@/lib/api-route-helpers";

export async function POST(req: Request) {
  try {
    const parsed = await parseJsonBody<{ paths?: string[]; inbox?: boolean }>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const paths = body.paths;
    if (!paths || paths.length < 2 || paths.length > 4) {
      return NextResponse.json({ error: "paths (2–4) required" }, { status: 400 });
    }
    const cfg = await getServerBrainConfig();
    const res = await runComparativeSynthesis(cfg, paths, {
      addToPromotionInbox: !!body.inbox,
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return internalServerError(e);
  }
}

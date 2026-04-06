import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import {
  requireDashboardApiKey,
  parseJsonBody,
} from "@/lib/api-route-helpers";
import { normalizeWikiRepoRel } from "@/lib/safe-repo-path";
import { recordPageSnapshot } from "@second-brain/core";

export async function POST(req: Request) {
  try {
    const unauthorized = requireDashboardApiKey(req);
    if (unauthorized) return unauthorized;
    const cfg = await getServerBrainConfig();
    const parsed = await parseJsonBody<{
      path?: string;
      reason?: string;
      runId?: string;
    }>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const safePath = normalizeWikiRepoRel(cfg, body.path ?? "");
    if (!safePath) {
      return NextResponse.json({ error: "invalid path" }, { status: 400 });
    }
    const out = await recordPageSnapshot(cfg, safePath, body.reason, body.runId);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

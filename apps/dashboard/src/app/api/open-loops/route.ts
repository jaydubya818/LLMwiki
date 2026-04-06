import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { parseJsonBody } from "@/lib/api-route-helpers";
import {
  brainPaths,
  readOpenLoops,
  updateOpenLoop,
  type OpenLoopStatus,
} from "@second-brain/core";

const LOOP_STATUSES: OpenLoopStatus[] = ["open", "in-progress", "resolved", "ignored"];

function isOpenLoopStatus(s: string): s is OpenLoopStatus {
  return (LOOP_STATUSES as string[]).includes(s);
}

export async function GET(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const { searchParams } = new URL(req.url);
    const domain = searchParams.get("domain");
    const f = await readOpenLoops(paths);
    const items = domain ? f.items.filter((i) => i.domain === domain) : f.items;
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
    const parsed = await parseJsonBody<{ id?: string; status?: string }>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    if (!body.id || !body.status) {
      return NextResponse.json({ error: "id and status required" }, { status: 400 });
    }
    if (!isOpenLoopStatus(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    const item = await updateOpenLoop(paths, body.id, {
      status: body.status,
    });
    return NextResponse.json({ ok: !!item, item });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

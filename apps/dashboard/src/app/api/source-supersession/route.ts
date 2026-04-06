import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { brainPaths, readSourceSupersession, updateSupersessionStatus } from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    return NextResponse.json(await readSourceSupersession(paths));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const ALLOWED_SUPERSESSION = ["suggested", "confirmed", "ignored"] as const;

export async function POST(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const body = (await req.json()) as { id?: string; status?: string };
    if (!body.id || !body.status) {
      return NextResponse.json({ error: "id and status required" }, { status: 400 });
    }
    if (!ALLOWED_SUPERSESSION.includes(body.status as (typeof ALLOWED_SUPERSESSION)[number])) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    const item = await updateSupersessionStatus(
      paths,
      body.id,
      body.status as "suggested" | "confirmed" | "ignored"
    );
    return NextResponse.json({ ok: !!item, item });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

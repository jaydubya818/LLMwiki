import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { requireDashboardApiKey } from "@/lib/api-route-helpers";
import { generateReviewPacket } from "@second-brain/core";

export async function POST(req: Request) {
  try {
    const unauthorized = requireDashboardApiKey(req);
    if (unauthorized) return unauthorized;
    const cfg = await getServerBrainConfig();
    const rel = await generateReviewPacket(cfg);
    return NextResponse.json({ ok: true, path: rel });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

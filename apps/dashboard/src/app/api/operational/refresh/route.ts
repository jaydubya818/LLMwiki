import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { requireDashboardApiKey } from "@/lib/api-route-helpers";
import { refreshOperationalIntelligence } from "@second-brain/core";

export async function POST(req: Request) {
  try {
    const unauthorized = requireDashboardApiKey(req);
    if (unauthorized) return unauthorized;
    const cfg = await getServerBrainConfig();
    const r = await refreshOperationalIntelligence(cfg);
    return NextResponse.json(r);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}

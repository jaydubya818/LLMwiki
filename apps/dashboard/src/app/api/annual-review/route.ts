import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { requireDashboardApiKey, internalServerError } from "@/lib/api-route-helpers";
import { generateAnnualReflectiveReview } from "@second-brain/core";

export async function POST(req: Request) {
  try {
    const unauthorized = requireDashboardApiKey(req);
    if (unauthorized) return unauthorized;
    const cfg = await getServerBrainConfig();
    const rel = await generateAnnualReflectiveReview(cfg);
    return NextResponse.json({ ok: true, path: rel });
  } catch (e) {
    return internalServerError(e);
  }
}

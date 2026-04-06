import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { generateAnnualReflectiveReview } from "@second-brain/core";

export async function POST() {
  try {
    const cfg = await getServerBrainConfig();
    const rel = await generateAnnualReflectiveReview(cfg);
    return NextResponse.json({ ok: true, path: rel });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

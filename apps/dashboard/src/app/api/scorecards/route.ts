import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { buildDomainScorecards } from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const cards = await buildDomainScorecards(cfg);
    return NextResponse.json({ scorecards: cards });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

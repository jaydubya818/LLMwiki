import { NextResponse } from "next/server";
import { getWorkspaceRootFromEnv } from "@/lib/brain";
import { syncCrossBrainSummary } from "@second-brain/core";

export async function POST() {
  try {
    const ws = getWorkspaceRootFromEnv();
    if (!ws) {
      return NextResponse.json(
        { error: "Set SECOND_BRAIN_WORKSPACE for cross-brain summary." },
        { status: 400 }
      );
    }
    const markdown = await syncCrossBrainSummary(ws);
    return NextResponse.json({ markdown });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { brainPaths, readReviewDebt } from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const d = await readReviewDebt(paths);
    return NextResponse.json(d ?? { error: "missing — run lint / operational refresh" });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

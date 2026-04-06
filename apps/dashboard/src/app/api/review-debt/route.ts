import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { internalServerError } from "@/lib/api-route-helpers";
import { brainPaths, readReviewDebt } from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const d = await readReviewDebt(paths);
    if (!d) {
      return NextResponse.json({ error: "missing — run lint / operational refresh" }, { status: 404 });
    }
    return NextResponse.json(d);
  } catch (e) {
    return internalServerError(e);
  }
}

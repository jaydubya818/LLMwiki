import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { internalServerError } from "@/lib/api-route-helpers";
import { brainPaths, readStrategicThemes } from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const f = await readStrategicThemes(paths);
    return NextResponse.json(f ?? { themes: [], version: 1 });
  } catch (e) {
    return internalServerError(e);
  }
}

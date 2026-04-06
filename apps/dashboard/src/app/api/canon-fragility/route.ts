import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { brainPaths, readCanonFragility } from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const f = await readCanonFragility(paths);
    return NextResponse.json(f ?? { error: "missing — run lint / operational refresh / brain executive-trust" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

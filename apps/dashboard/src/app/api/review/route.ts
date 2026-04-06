import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { brainPaths, setFileDecision } from "@second-brain/core";

export async function POST(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const body = (await req.json()) as {
      path?: string;
      decision?: "pending" | "approved" | "rejected";
    };
    if (!body.path || !body.decision) {
      return NextResponse.json({ error: "path + decision required" }, { status: 400 });
    }
    await setFileDecision(paths, body.path, body.decision);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

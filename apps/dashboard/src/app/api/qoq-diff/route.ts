import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { listQuarterlyReviewFiles, generateQuarterOverQuarterDiff } from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const files = await listQuarterlyReviewFiles(cfg, 40);
    return NextResponse.json({ quarterlyReviews: files });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const body = (await req.json()) as { from?: string; to?: string };
    if (!body.from || !body.to) {
      return NextResponse.json({ error: "from and to (repo-relative paths) required" }, { status: 400 });
    }
    const rel = await generateQuarterOverQuarterDiff(cfg, body.from.replace(/^\/+/, ""), body.to.replace(/^\/+/, ""));
    return NextResponse.json({ ok: true, path: rel });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { requireDashboardApiKey, parseJsonBody } from "@/lib/api-route-helpers";
import { normalizeWikiRepoRel } from "@/lib/safe-repo-path";
import { brainPaths, readHumanReview, markHumanReviewedInWiki } from "@second-brain/core";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const pathParam = searchParams.get("path");
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const reviewData = await readHumanReview(paths);
    if (!reviewData) {
      return NextResponse.json({
        path: pathParam,
        row: null,
        note: "Run operational refresh first.",
      });
    }
    const pages = Array.isArray(reviewData.pages) ? reviewData.pages : [];
    if (pathParam) {
      const page = pages.find((row) => row.path === pathParam) ?? null;
      return NextResponse.json({ path: pathParam, row: page });
    }
    return NextResponse.json(reviewData);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const unauthorized = requireDashboardApiKey(req);
    if (unauthorized) return unauthorized;
    const cfg = await getServerBrainConfig();
    const parsed = await parseJsonBody<{ path?: string; by?: string }>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    if (!body.path) {
      return NextResponse.json({ error: "path required" }, { status: 400 });
    }
    const safePath = normalizeWikiRepoRel(cfg, body.path);
    if (!safePath) {
      return NextResponse.json({ error: "invalid path" }, { status: 400 });
    }
    await markHumanReviewedInWiki(cfg, safePath, body.by);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

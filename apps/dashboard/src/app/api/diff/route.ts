import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getServerBrainConfig } from "@/lib/brain";
import { internalServerError } from "@/lib/api-route-helpers";
import { resolveWikiGitFileParam } from "@/lib/safe-repo-path";
import {
  getWikiDiffForBrain,
  getWikiFileDiffForBrain,
  getWikiFileAtHead,
  getWikiStatusFilesForBrain,
  brainPaths,
  readReviewState,
  suggestWikiCommitWithContext,
  enrichWikiDiffFiles,
  isSuggestedCommitContextStale,
  listRuns,
} from "@second-brain/core";

export async function GET(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const url = new URL(req.url);
    const fileParam = url.searchParams.get("file");

    if (fileParam) {
      const resolved = resolveWikiGitFileParam(cfg, fileParam);
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.reason }, { status: 400 });
      }
      const safe = resolved.repoRel;
      const [fileDiff, headContent, workContent] = await Promise.all([
        getWikiFileDiffForBrain(cfg, safe),
        getWikiFileAtHead(cfg, safe),
        fs.readFile(path.join(cfg.gitRoot, safe), "utf8").catch(() => ""),
      ]);
      return NextResponse.json({
        file: safe,
        fileDiff,
        headContent,
        workContent,
      });
    }

    const [
      patch,
      files,
      reviewState,
      suggestCtx,
      runs,
    ] = await Promise.all([
      getWikiDiffForBrain(cfg),
      getWikiStatusFilesForBrain(cfg),
      readReviewState(paths),
      suggestWikiCommitWithContext(paths),
      listRuns(paths, 12),
    ]);
    const enriched = await enrichWikiDiffFiles(cfg, paths, files, reviewState);
    const suggestedStale = isSuggestedCommitContextStale(
      reviewState.updatedAt,
      suggestCtx.ingestStartedAt
    );

    const ingestRun = runs.find((r) => r.kind === "ingest");
    const lintRun = runs.find((r) => r.kind === "lint");
    const reviewRun = runs.find((r) => r.kind === "review");

    return NextResponse.json({
      patch,
      files: enriched,
      brainName: cfg.brainName,
      reviewState,
      suggestedCommitMessage: suggestCtx.message,
      suggestedCommitContext: {
        ingestStartedAt: suggestCtx.ingestStartedAt,
        ingestFinishedAt: suggestCtx.ingestFinishedAt,
        ingestId: suggestCtx.ingestId,
        likelyStaleAfterNewIngest: suggestedStale,
      },
      activity: {
        lastIngest: ingestRun
          ? { startedAt: ingestRun.startedAt, summary: ingestRun.summary, ok: ingestRun.ok }
          : null,
        lastLint: lintRun
          ? { startedAt: lintRun.startedAt, summary: lintRun.summary, ok: lintRun.ok }
          : null,
        lastReview: reviewRun
          ? { startedAt: reviewRun.startedAt, summary: reviewRun.summary, ok: reviewRun.ok }
          : null,
      },
      trustNote:
        files.length > 0
          ? "Uncommitted wiki changes are provisional until you review and commit to git."
          : "No pending wiki changes in git working tree.",
    });
  } catch (e) {
    return internalServerError(e);
  }
}

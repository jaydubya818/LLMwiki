import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import {
  getWikiDiffForBrain,
  getWikiStatusFilesForBrain,
  brainPaths,
  readReviewState,
  suggestWikiCommitMessage,
} from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const [patch, files, reviewState, suggestedCommitMessage] = await Promise.all([
      getWikiDiffForBrain(cfg),
      getWikiStatusFilesForBrain(cfg),
      readReviewState(paths),
      suggestWikiCommitMessage(paths),
    ]);
    return NextResponse.json({
      patch,
      files,
      brainName: cfg.brainName,
      reviewState,
      suggestedCommitMessage,
      trustNote:
        files.length > 0
          ? "Uncommitted wiki changes are provisional until you review and commit."
          : "No pending wiki changes in git working tree.",
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

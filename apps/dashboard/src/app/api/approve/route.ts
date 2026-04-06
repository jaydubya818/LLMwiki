import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import {
  applyReviewDecisions,
  approveAllPendingPaths,
  brainPaths,
  getWikiStatusFilesForBrain,
  readReviewState,
} from "@second-brain/core";
import { internalServerError, parseJsonBody } from "@/lib/api-route-helpers";

export async function POST(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const parsed = await parseJsonBody<{
      commitMessage?: string;
      approveAllPending?: boolean;
      mode?: "commit" | "decisions_only";
    }>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const mode = body.mode ?? "commit";

    if (body.approveAllPending) {
      const pendingFiles = await getWikiStatusFilesForBrain(cfg);
      await approveAllPendingPaths(
        paths,
        pendingFiles.map((f) => f.path)
      );
    }

    if (mode === "decisions_only") {
      const state = await readReviewState(paths);
      return NextResponse.json({
        ok: true,
        committed: false,
        message:
          "Decisions saved in .brain/review-state.json only — run Commit approved when ready.",
        reviewState: state,
      });
    }

    const msg = body.commitMessage?.trim();
    if (!msg) {
      return NextResponse.json(
        {
          error:
            "commitMessage is required and must not be empty or whitespace-only.",
        },
        { status: 400 }
      );
    }

    const res = await applyReviewDecisions(cfg, paths, { commitMessage: msg });
    return NextResponse.json({
      ok: true,
      committed: res.committed,
      message: res.message,
    });
  } catch (e) {
    return internalServerError(e);
  }
}

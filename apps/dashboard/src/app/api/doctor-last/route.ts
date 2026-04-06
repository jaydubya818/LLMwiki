import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import {
  brainPaths,
  readState,
  readLastDoctorCache,
  computeDoctorCacheHints,
  getWikiStatusFilesForBrain,
} from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const [cache, state, pendingFiles] = await Promise.all([
      readLastDoctorCache(paths),
      readState(paths),
      getWikiStatusFilesForBrain(cfg).catch(() => []),
    ]);
    const pendingWikiCountNow = pendingFiles.length;
    const { staleByAge, hints } = cache
      ? computeDoctorCacheHints(cache, {
          pendingWikiCountNow,
          lastIngestAt: state.lastIngestAt,
          lastLintAt: state.lastLintAt,
          lastReviewAt: state.lastReviewAt,
        })
      : { staleByAge: false, hints: [] as string[] };

    const neverRun = !cache;

    return NextResponse.json({
      cache,
      meta: {
        neverRun,
        staleByAge,
        hints,
        pendingWikiCountNow,
      },
    });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    return NextResponse.json({
      cache: null,
      meta: {
        neverRun: true,
        staleByAge: false,
        hints: ["Could not load brain config — set SECOND_BRAIN_ROOT or workspace env."],
        pendingWikiCountNow: 0,
        error: msg,
      },
    });
  }
}

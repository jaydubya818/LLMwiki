import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import {
  brainPaths,
  readState,
  listRuns,
  loadSearchIndex,
  getWikiStatusFilesForBrain,
  readReviewState,
  listRecentMarkdown,
  suggestWikiCommitMessage,
  readLastCanonGuardCache,
  readGovernanceSettings,
  detectCanonGuardHookInstallation,
} from "@second-brain/core";
import fs from "node:fs/promises";

function daysSinceIso(iso?: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (86400 * 1000);
}

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const root = cfg.root;
    const paths = brainPaths(root);
    const [
      state,
      runs,
      index,
      graphRaw,
      logTail,
      gitFiles,
      reviewState,
      recentWiki,
      recentOutputs,
      suggestedCommitMessage,
      canonGuardCache,
      governanceSettings,
      hookDetect,
    ] = await Promise.all([
      readState(paths),
      listRuns(paths, 16),
      loadSearchIndex(paths),
      fs.readFile(paths.graphJson, "utf8").catch(() => ""),
      fs.readFile(paths.logMd, "utf8").catch(() => ""),
      getWikiStatusFilesForBrain(cfg),
      readReviewState(paths),
      listRecentMarkdown(root, "wiki", 10),
      listRecentMarkdown(root, "outputs", 8),
      suggestWikiCommitMessage(paths),
      readLastCanonGuardCache(paths),
      readGovernanceSettings(paths),
      detectCanonGuardHookInstallation(cfg.gitRoot),
    ]);

    let graphMeta: Record<string, unknown> = {};
    try {
      if (graphRaw) {
        const g = JSON.parse(graphRaw) as { nodes?: unknown[]; edges?: unknown[] };
        graphMeta = {
          nodeCount: g.nodes?.length ?? 0,
          orphans: (g.nodes as { orphan?: boolean }[] | undefined)?.filter(
            (n) => n.orphan
          ).length,
        };
      }
    } catch {
      graphMeta = {};
    }

    const pendingPaths = gitFiles.map((f) => f.path);
    const pendingCount = pendingPaths.length;

    const reviewPending = pendingPaths.filter(
      (p) => !reviewState.files[p] || reviewState.files[p] === "pending"
    ).length;

    const ingestAge = daysSinceIso(state.lastIngestAt);
    const lintAge = daysSinceIso(state.lastLintAt);
    const reviewAge = daysSinceIso(state.lastReviewAt);

    const staleIngest = ingestAge !== null && ingestAge > 7;
    const staleLint = lintAge !== null && lintAge > 7;
    const trustLevel: "clean" | "attention" = pendingCount > 0 ? "attention" : "clean";

    const lastIngestRun = runs.find((r) => r.kind === "ingest");
    const lastLintRun = runs.find((r) => r.kind === "lint");
    const lastReviewRun = runs.find((r) => r.kind === "review");

    const nextActions: string[] = [];
    if (pendingCount > 0) {
      nextActions.push(`Review ${pendingCount} pending wiki path(s) in Diff, then run brain approve.`);
    }
    if (staleIngest) {
      nextActions.push("Run ingest — last ingest was over a week ago.");
    }
    if (staleLint) {
      nextActions.push("Run lint — last lint was over a week ago.");
    }
    if ((reviewAge ?? 99) > 7) {
      nextActions.push("Run weekly executive review (dashboard or brain review).");
    }
    if (nextActions.length === 0) {
      nextActions.push("Capture new notes into raw/, then ingest when ready.");
    }

    return NextResponse.json({
      root,
      brainName: cfg.brainName,
      vaultName: cfg.vaultName,
      vaultNameSource: cfg.vaultNameSource,
      workspaceRoot: cfg.workspaceRoot ?? null,
      gitRoot: cfg.gitRoot,
      state,
      runs,
      searchDocs: index?.docs?.length ?? 0,
      graphMeta,
      logTail: logTail.split("\n").slice(-12).join("\n"),
      canonGuard: canonGuardCache
        ? {
            updatedAt: canonGuardCache.updatedAt,
            maxVerdict: canonGuardCache.maxVerdict,
            summaryLine: canonGuardCache.summaryLine,
            findingCount: canonGuardCache.findingCount,
            highAttentionPaths: canonGuardCache.highAttentionPaths,
            paths: canonGuardCache.paths,
            ignoredNoiseCount: canonGuardCache.ignoredNoiseCount,
            respectIgnore: canonGuardCache.respectIgnore,
          }
        : null,
      trustHooks: {
        preCommit: hookDetect.preCommit,
        prePush: hookDetect.prePush,
        ignoreRuleCount:
          (governanceSettings.canonGuardIgnorePrefixes?.length ?? 0) +
          (governanceSettings.canonGuardIgnorePaths?.length ?? 0),
        commitWarnOnly: governanceSettings.canonGuardHookWarnOnly,
        prePushWarnOnly: governanceSettings.canonGuardPrePushWarnOnly,
        prePushEnabled: governanceSettings.enablePrePushCanonGuard,
      },
      operational: {
        pendingWikiCount: pendingCount,
        pendingPaths: pendingPaths.slice(0, 40),
        reviewPendingCount: reviewPending,
        reviewStateVersion: reviewState.updatedAt,
        fileDecisions: reviewState.files,
        recentWiki,
        recentOutputs,
        suggestedCommitMessage,
        staleIngest,
        staleLint,
        ingestAgeDays: ingestAge,
        lintAgeDays: lintAge,
        reviewAgeDays: reviewAge,
        trustLevel,
        lastIngestSummary: lastIngestRun?.summary,
        lastLintSummary: lastLintRun?.summary,
        lastReviewSummary: lastReviewRun?.summary,
        nextActions,
      },
    });
  } catch (e) {
    console.error("[api/status] GET failed:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

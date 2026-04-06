import fs from "node:fs/promises";
import path from "node:path";
import type { BrainConfig } from "../config.js";
import type { BrainPaths } from "../paths.js";
import { readState } from "../state.js";
import { listRuns, type RunRecord } from "../runs.js";
import type { ReviewState } from "./git-approve.js";

export type InferredWikiSource =
  | "ingest"
  | "compile"
  | "lint"
  | "review"
  | "manual"
  | "unknown";

export interface EnrichedDiffFile {
  path: string;
  workingDir: string;
  domain: string;
  mtimeMs: number | null;
  decision: "pending" | "approved" | "rejected";
  inferredSource: InferredWikiSource;
}

function domainFromPath(repoPath: string, wikiPrefix: string): string {
  const norm = wikiPrefix.replace(/\/$/, "");
  if (!repoPath.startsWith(norm)) return "wiki";
  const rest = repoPath.slice(norm.length).replace(/^\//, "");
  const seg = rest.split("/").filter(Boolean);
  return seg[0] ?? "wiki";
}

function inferSource(
  mtimeMs: number | null,
  state: Awaited<ReturnType<typeof readState>>,
  runs: RunRecord[]
): InferredWikiSource {
  if (mtimeMs == null) return "unknown";
  const t = mtimeMs;
  const candidates: { kind: InferredWikiSource; at?: string }[] = [
    { kind: "ingest", at: state.lastIngestAt },
    { kind: "compile", at: state.lastCompileAt },
    { kind: "lint", at: state.lastLintAt },
    { kind: "review", at: state.lastReviewAt },
  ];
  let best: InferredWikiSource = "unknown";
  let bestDelta = Infinity;
  for (const c of candidates) {
    if (!c.at) continue;
    const rt = Date.parse(c.at);
    if (Number.isNaN(rt)) continue;
    const delta = Math.abs(t - rt);
    if (delta < bestDelta && delta < 20 * 60 * 1000) {
      bestDelta = delta;
      best = c.kind;
    }
  }
  if (best !== "unknown") return best;
  const latestIngest = runs.find((r) => r.kind === "ingest");
  const fin = latestIngest?.finishedAt ?? latestIngest?.startedAt;
  if (fin) {
    const ft = Date.parse(fin);
    if (!Number.isNaN(ft) && t >= ft - 120_000 && t <= ft + 2 * 3600_000) {
      return "ingest";
    }
  }
  return "manual";
}

/**
 * Adds domain grouping, mtimes, review decision, and coarse provenance hints for dashboard diff UI.
 * Extension point: swap `inferSource` later for claim-level provenance without changing the API shape.
 */
export async function enrichWikiDiffFiles(
  cfg: BrainConfig,
  paths: BrainPaths,
  gitFiles: Array<{ path: string; workingDir: string }>,
  reviewState: ReviewState
): Promise<EnrichedDiffFile[]> {
  const state = await readState(paths);
  const runs = await listRuns(paths, 30);
  const wikiPrefix = cfg.wikiGitPrefix.replace(/\\/g, "/");
  const out: EnrichedDiffFile[] = [];
  for (const f of gitFiles) {
    const abs = path.join(cfg.gitRoot, f.path);
    let mtimeMs: number | null = null;
    try {
      const st = await fs.stat(abs);
      mtimeMs = st.mtimeMs;
    } catch {
      mtimeMs = null;
    }
    const decision = reviewState.files[f.path] ?? "pending";
    out.push({
      path: f.path,
      workingDir: f.workingDir,
      domain: domainFromPath(f.path, wikiPrefix),
      mtimeMs,
      decision,
      inferredSource: inferSource(mtimeMs, state, runs),
    });
  }
  out.sort((a, b) => {
    if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
    return a.path.localeCompare(b.path);
  });
  return out;
}

/** True if the latest ingest started after review UI last saved decisions (new churn may need re-triage). */
export function isSuggestedCommitContextStale(
  reviewStateUpdatedAt: string,
  latestIngestStartedAt?: string
): boolean {
  if (!latestIngestStartedAt) return false;
  const a = Date.parse(reviewStateUpdatedAt);
  const b = Date.parse(latestIngestStartedAt);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return b > a;
}

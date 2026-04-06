import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { v4 as uuid } from "uuid";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";
import { listRuns } from "../runs.js";

export interface SnapshotBundleEvent {
  id: string;
  pagePath: string;
  createdAt: string;
  reason?: string;
  /** Copy under outputs/reviews/snapshots/ */
  artifactRelPath: string;
  runId?: string;
}

export interface SnapshotBundleFile {
  version: 1;
  updatedAt: string;
  entries: SnapshotBundleEvent[];
}

export async function readSnapshotBundles(paths: BrainPaths): Promise<SnapshotBundleFile> {
  try {
    const raw = await fs.readFile(paths.snapshotBundlesJson, "utf8");
    const j = JSON.parse(raw) as SnapshotBundleFile;
    if (!j.entries) j.entries = [];
    return j;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
  }
}

export async function writeSnapshotBundles(paths: BrainPaths, f: SnapshotBundleFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.snapshotBundlesJson), { recursive: true });
  await fs.writeFile(
    paths.snapshotBundlesJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

/**
 * Copies current wiki markdown to outputs/reviews/snapshots for historical diffing.
 */
export async function recordPageSnapshot(
  cfg: BrainConfig,
  pagePath: string,
  reason?: string,
  runId?: string
): Promise<{ artifactRel: string; id: string }> {
  const paths = brainPaths(cfg.root);
  const norm = pagePath.replace(/^\//, "");
  const abs = path.join(cfg.root, norm);
  const raw = await fs.readFile(abs, "utf8");
  await fs.mkdir(paths.pageSnapshotsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.basename(norm, ".md").replace(/[^\w-]+/g, "-").slice(0, 60);
  const fname = `${base}-${stamp}.md`;
  const destAbs = path.join(paths.pageSnapshotsDir, fname);
  const wrapped = matter.stringify(raw, {
    type: "page_snapshot",
    source_wiki: norm,
    snapshot_reason: reason ?? "manual",
    created_at: new Date().toISOString(),
    run_id: runId,
  });
  await fs.writeFile(destAbs, wrapped, "utf8");
  const artifactRel = path.relative(cfg.root, destAbs).split(path.sep).join("/");

  const bundle = await readSnapshotBundles(paths);
  const id = uuid();
  bundle.entries.unshift({
    id,
    pagePath: norm,
    createdAt: new Date().toISOString(),
    reason,
    artifactRelPath: artifactRel,
    runId,
  });
  bundle.entries = bundle.entries.slice(0, 400);
  await writeSnapshotBundles(paths, bundle);
  return { artifactRel, id };
}

export interface PageSnapshotBundleView {
  pagePath: string;
  snapshots: SnapshotBundleEvent[];
  runsTouchingPage: { id: string; kind: string; summary: string; startedAt: string }[];
}

export async function buildSnapshotBundleView(
  cfg: BrainConfig,
  pagePath: string
): Promise<PageSnapshotBundleView> {
  const paths = brainPaths(cfg.root);
  const norm = pagePath.replace(/^\//, "");
  const bundle = await readSnapshotBundles(paths);
  const snaps = bundle.entries.filter((e) => e.pagePath === norm).slice(0, 50);
  const runs = await listRuns(paths, 80);
  const runsTouchingPage = runs
    .filter((r) => r.changedFiles?.includes(norm))
    .slice(0, 20)
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      summary: r.summary,
      startedAt: r.startedAt,
    }));
  return { pagePath: norm, snapshots: snaps, runsTouchingPage };
}

export function renderSnapshotDiffSummaryMd(view: PageSnapshotBundleView): string {
  const lines: string[] = [
    "---",
    `title: Snapshot bundle — ${view.pagePath}`,
    `kind: snapshot-bundle-summary`,
    `generated: ${new Date().toISOString()}`,
    "---",
    "",
    `## ${view.pagePath}`,
    "",
    "### Saved snapshots",
    ...view.snapshots.map(
      (s) =>
        `- ${s.createdAt.slice(0, 19)} — \`${s.artifactRelPath}\`${s.reason ? ` — _${s.reason}_` : ""}`
    ),
    "",
    "### Recent runs touching this file",
    ...view.runsTouchingPage.map((r) => `- \`${r.startedAt.slice(0, 10)}\` **${r.kind}** — ${r.summary}`),
    "",
  ];
  return lines.join("\n");
}

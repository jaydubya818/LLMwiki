import path from "node:path";
import type { BrainConfig } from "./config.js";

export function brainPaths(root: string) {
  const r = path.resolve(root);
  return {
    root: r,
    raw: path.join(r, "raw"),
    wiki: path.join(r, "wiki"),
    outputs: path.join(r, "outputs"),
    videos: path.join(r, "videos"),
    assets: path.join(r, "assets"),
    brain: path.join(r, ".brain"),
    claudeMd: path.join(r, "CLAUDE.md"),
    readme: path.join(r, "README.md"),
    logMd: path.join(r, "log.md"),
    envFile: path.join(r, ".env"),
    stateJson: path.join(r, ".brain", "state.json"),
    fileHashesJson: path.join(r, ".brain", "file-hashes.json"),
    ingestCacheJson: path.join(r, ".brain", "ingest-cache.json"),
    graphJson: path.join(r, ".brain", "graph.json"),
    searchIndexJson: path.join(r, ".brain", "search-index.json"),
    runsDir: path.join(r, ".brain", "runs"),
    promptsDir: path.join(r, ".brain", "prompts"),
    templatesDir: path.join(r, ".brain", "templates"),
    reviewStateJson: path.join(r, ".brain", "review-state.json"),
    lastDoctorJson: path.join(r, ".brain", "last-doctor.json"),
    indexMd: path.join(r, "wiki", "INDEX.md"),
    dashboardMd: path.join(r, "wiki", "dashboard.md"),
    dailyVideosMd: path.join(r, "videos", "daily_videos.md"),
  };
}

export type BrainPaths = ReturnType<typeof brainPaths>;

export function wikiPagePath(
  cfg: BrainConfig,
  domainFolder: string,
  slug: string
): string {
  return path.join(cfg.root, "wiki", domainFolder, `${slug}.md`);
}

import { simpleGit } from "simple-git";
import type { StatusResult } from "simple-git";
import fs from "node:fs/promises";
import path from "node:path";
import type { BrainConfig } from "../config.js";

function normPrefix(prefix: string): string {
  return prefix.replace(/\\/g, "/").replace(/\/$/, "");
}

export async function ensureGitRepo(root: string): Promise<void> {
  const gitDir = path.join(root, ".git");
  try {
    await fs.access(gitDir);
  } catch {
    const git = simpleGit(root);
    await git.init();
  }
}

export async function getWikiDiffForBrain(cfg: BrainConfig): Promise<string> {
  const git = simpleGit(cfg.gitRoot);
  const p = normPrefix(cfg.wikiGitPrefix);
  const diff = await git.diff(["--", p]);
  return diff;
}

export async function getWikiStatusFilesForBrain(cfg: BrainConfig): Promise<
  Array<{ path: string; workingDir: string }>
> {
  const git = simpleGit(cfg.gitRoot);
  const status: StatusResult = await git.status();
  const p = normPrefix(cfg.wikiGitPrefix);
  return status.files
    .filter((f) => f.path === p || f.path.startsWith(`${p}/`))
    .map((f) => ({
      path: f.path,
      workingDir:
        String(f.working_dir) === "?" ? "untracked" : String(f.working_dir),
    }));
}

export async function stageWikiAndCommitForBrain(
  cfg: BrainConfig,
  message: string,
  files?: string[]
): Promise<void> {
  const git = simpleGit(cfg.gitRoot);
  if (files?.length) {
    await git.add(files);
  } else {
    await git.add([normPrefix(cfg.wikiGitPrefix)]);
  }
  await git.commit(message);
}

export async function discardWikiFileForBrain(
  cfg: BrainConfig,
  repoRelativePath: string
): Promise<void> {
  const git = simpleGit(cfg.gitRoot);
  await git.checkout(["--", repoRelativePath]);
}

/** @deprecated use getWikiDiffForBrain */
export async function getWikiDiff(root: string): Promise<string> {
  const git = simpleGit(root);
  return git.diff(["--", "wiki"]);
}

/** @deprecated use getWikiStatusFilesForBrain */
export async function getWikiStatusFiles(root: string): Promise<
  Array<{ path: string; workingDir: string }>
> {
  const git = simpleGit(root);
  const status: StatusResult = await git.status();
  return status.files
    .filter((f) => f.path.startsWith("wiki/"))
    .map((f) => ({
      path: f.path,
      workingDir:
        String(f.working_dir) === "?" ? "untracked" : String(f.working_dir),
    }));
}

/** @deprecated use stageWikiAndCommitForBrain */
export async function stageWikiAndCommit(
  root: string,
  message: string,
  files?: string[]
): Promise<void> {
  const git = simpleGit(root);
  if (files?.length) {
    await git.add(files);
  } else {
    await git.add(["wiki"]);
  }
  await git.commit(message);
}

/** @deprecated use discardWikiFileForBrain */
export async function discardWikiFile(root: string, relPath: string): Promise<void> {
  const git = simpleGit(root);
  await git.checkout(["--", relPath]);
}

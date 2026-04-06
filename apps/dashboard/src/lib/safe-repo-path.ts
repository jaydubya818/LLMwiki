import path from "node:path";
import type { BrainConfig } from "@second-brain/core";

function normPrefix(prefix: string): string {
  return prefix.replace(/\\/g, "/").replace(/\/$/, "");
}

function toFsSegments(posixRel: string): string[] {
  return posixRel.split("/").filter((s) => s.length > 0);
}

/** True if abs is under base (directories resolved, comparisons normalized). */
function isContainedInDir(abs: string, base: string): boolean {
  const absN = path.resolve(abs);
  const baseN = path.resolve(base);
  if (absN === baseN) return true;
  const sep = path.sep;
  const prefix = baseN.endsWith(sep) ? baseN : baseN + sep;
  return absN.startsWith(prefix);
}

/**
 * Resolve and validate a repo-relative path from the wiki git prefix (diff API, git-relative files).
 */
export function resolveWikiGitFileParam(
  cfg: BrainConfig,
  fileParam: string
): { ok: true; repoRel: string }   | { ok: false; reason: string } {
  let decoded = fileParam.replace(/\0/g, "");
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return { ok: false, reason: "Invalid file parameter" };
  }

  let rel = decoded.replace(/\\/g, "/").replace(/^\//, "");
  rel = path.posix.normalize(rel);
  if (rel.startsWith("../") || rel.includes("/../")) {
    return { ok: false, reason: "Path outside wiki scope" };
  }

  const prefix = normPrefix(cfg.wikiGitPrefix);
  const gitRoot = path.resolve(cfg.gitRoot);
  const prefixAbs = path.resolve(gitRoot, ...toFsSegments(prefix));
  const fileAbs = path.resolve(gitRoot, ...toFsSegments(rel));

  if (!isContainedInDir(fileAbs, gitRoot)) {
    return { ok: false, reason: "Path outside wiki scope" };
  }
  if (!isContainedInDir(fileAbs, prefixAbs)) {
    return { ok: false, reason: "Path outside wiki scope" };
  }

  return { ok: true, repoRel: rel };
}

/**
 * Normalize a wiki repo-relative path (wiki/...) for trace/snapshot/human-review. Returns null if invalid.
 */
export function normalizeWikiRepoRel(cfg: BrainConfig, raw: string | undefined): string | null {
  if (raw == null || raw === "") return null;
  let s = raw.replace(/\0/g, "");
  try {
    s = decodeURIComponent(s);
  } catch {
    return null;
  }
  s = s.replace(/\\/g, "/").replace(/^\//, "");
  s = path.posix.normalize(s);
  if (s.startsWith("../") || s.includes("/../")) return null;

  const prefix = normPrefix(cfg.wikiGitPrefix);
  if (s !== prefix && !s.startsWith(`${prefix}/`)) return null;

  const gitRoot = path.resolve(cfg.gitRoot);
  const prefixAbs = path.resolve(gitRoot, ...toFsSegments(prefix));
  const fileAbs = path.resolve(gitRoot, ...toFsSegments(s));
  if (!isContainedInDir(fileAbs, gitRoot) || !isContainedInDir(fileAbs, prefixAbs)) {
    return null;
  }

  return s;
}

/**
 * Resolve user-provided path relative to vault root; must stay inside cfg.root.
 */
export function safeResolveUnderVaultRoot(
  root: string,
  userRel: string
): { ok: true; abs: string } | { ok: false; reason: string } {
  const clean = userRel.replace(/\0/g, "").replace(/\\/g, "/").replace(/^\//, "");
  const norm = path.posix.normalize(clean);
  if (norm.startsWith("../") || norm.includes("/../")) {
    return { ok: false, reason: "invalid path" };
  }
  const abs = path.resolve(root, ...toFsSegments(norm));
  if (!isContainedInDir(abs, path.resolve(root))) {
    return { ok: false, reason: "path outside vault" };
  }
  return { ok: true, abs };
}

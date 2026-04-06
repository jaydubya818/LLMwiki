import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";
import { parseWikiEditPolicy } from "../trust/canonical-lock.js";

export type HumanReviewBadge =
  | "ai-maintained"
  | "human-reviewed"
  | "canonical-human-reviewed"
  | "review-needed"
  | "outdated-human-review";

export interface HumanReviewRow {
  path: string;
  badge: HumanReviewBadge;
  humanReviewedAt?: string;
  humanReviewedBy?: string;
  wikiMtimeMs: number;
  /** True when file changed after last human_reviewed_at (heuristic). */
  staleAfterEdit: boolean;
  policy: ReturnType<typeof parseWikiEditPolicy>;
  canonicalFm: boolean;
}

export interface HumanReviewFile {
  version: 1;
  updatedAt: string;
  pages: HumanReviewRow[];
}

export async function readHumanReview(paths: BrainPaths): Promise<HumanReviewFile | null> {
  try {
    const raw = await fs.readFile(paths.humanReviewJson, "utf8");
    return JSON.parse(raw) as HumanReviewFile;
  } catch {
    return null;
  }
}

export async function writeHumanReview(paths: BrainPaths, f: HumanReviewFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.humanReviewJson), { recursive: true });
  await fs.writeFile(
    paths.humanReviewJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

function badgeForRow(params: {
  fm: Record<string, unknown>;
  policy: ReturnType<typeof parseWikiEditPolicy>;
  mtimeMs: number;
}): Omit<HumanReviewRow, "path" | "wikiMtimeMs"> {
  const canonicalFm =
    params.fm.canonical === true ||
    params.fm.canonical === "true" ||
    params.fm.canonical === "yes";
  const hr = params.fm.human_reviewed;
  const reviewed =
    hr === true ||
    hr === "true" ||
    hr === "yes" ||
    (typeof params.fm.human_reviewed_at === "string" &&
      String(params.fm.human_reviewed_at).length > 8);
  const atRaw = params.fm.human_reviewed_at;
  const at = typeof atRaw === "string" ? Date.parse(atRaw) : NaN;
  const by = typeof params.fm.human_reviewed_by === "string" ? params.fm.human_reviewed_by : undefined;

  const staleAfterEdit =
    reviewed && !Number.isNaN(at) && params.mtimeMs > at + 60_000; // 1min slack

  let badge: HumanReviewBadge = "ai-maintained";
  if (reviewed && !staleAfterEdit) {
    if (canonicalFm || params.policy !== "open") {
      badge = "canonical-human-reviewed";
    } else {
      badge = "human-reviewed";
    }
  } else if (reviewed && staleAfterEdit) {
    badge = "outdated-human-review";
  } else if (params.policy !== "open" || canonicalFm) {
    badge = "review-needed";
  }

  return {
    badge,
    humanReviewedAt: Number.isNaN(at) ? undefined : new Date(at).toISOString(),
    humanReviewedBy: by,
    staleAfterEdit,
    policy: params.policy,
    canonicalFm,
  };
}

export async function syncHumanReviewIndex(
  cfg: BrainConfig,
  wikiRelPaths: string[]
): Promise<HumanReviewFile> {
  const paths = brainPaths(cfg.root);
  const pages: HumanReviewRow[] = [];

  for (const rel of wikiRelPaths) {
    const abs = path.join(cfg.root, rel);
    let mtimeMs = 0;
    let data: Record<string, unknown> = {};
    try {
      const st = await fs.stat(abs);
      mtimeMs = st.mtimeMs;
      const raw = await fs.readFile(abs, "utf8");
      data = matter(raw).data as Record<string, unknown>;
    } catch {
      continue;
    }
    const policy = parseWikiEditPolicy(data);
    const partial = badgeForRow({ fm: data, policy, mtimeMs });
    pages.push({ path: rel, wikiMtimeMs: mtimeMs, ...partial });
  }

  const file: HumanReviewFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    pages,
  };
  await writeHumanReview(paths, file);
  return file;
}

/** Mark page as human-reviewed in frontmatter (markdown-first). */
export async function markHumanReviewedInWiki(
  cfg: BrainConfig,
  pagePath: string,
  by?: string
): Promise<void> {
  const paths = brainPaths(cfg.root);
  const norm = pagePath.replace(/^\//, "").replace(/\\/g, "/");
  const posixNorm = path.posix.normalize(norm);
  if (
    posixNorm.startsWith("../") ||
    posixNorm.includes("/../") ||
    !posixNorm.startsWith("wiki/")
  ) {
    throw new Error("Invalid wiki page path");
  }
  const abs = path.resolve(cfg.root, posixNorm.split("/").join(path.sep));
  const rootAbs = path.resolve(cfg.root);
  const rootPrefix = rootAbs.endsWith(path.sep) ? rootAbs : `${rootAbs}${path.sep}`;
  if (abs !== rootAbs && !abs.startsWith(rootPrefix)) {
    throw new Error("Path escapes vault root");
  }
  const raw = await fs.readFile(abs, "utf8");
  const { content, data } = matter(raw);
  const fm = { ...(data as Record<string, unknown>) };
  fm.human_reviewed = true;
  fm.human_reviewed_at = new Date().toISOString();
  if (by) fm.human_reviewed_by = by;
  await fs.writeFile(abs, matter.stringify(content, fm), "utf8");
  const wikiFiles = await fg(
    path.join(paths.wiki, "**/*.md").replace(/\\/g, "/"),
    { onlyFiles: true }
  );
  const wikiRelPaths = wikiFiles.map((a) => path.relative(cfg.root, a).split(path.sep).join("/"));
  await syncHumanReviewIndex(cfg, wikiRelPaths);
}

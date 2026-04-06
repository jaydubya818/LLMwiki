import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";
import type { KnowledgeGraph } from "../graph/builder.js";
import { parseWikiEditPolicy, lockBadgeLabel } from "../trust/canonical-lock.js";
import { readPageQuality } from "../trust/page-quality.js";
import { readUnsupportedClaims } from "../trust/unsupported-claims.js";
import { readConflicts } from "../trust/conflicts.js";
import { readKnowledgeDrift } from "../trust/knowledge-drift.js";
import { readEvidenceDensity } from "./evidence-density.js";
import { readHumanReview } from "./human-review.js";

export type CanonicalUrgency = "attention" | "watch" | "ok";

export interface CanonicalBoardItem {
  path: string;
  title: string;
  policy: ReturnType<typeof parseWikiEditPolicy>;
  lockLabel: string;
  isCanonicalFm: boolean;
  pendingProposals: number;
  wikiMtimeMs?: number;
  evidenceBucket?: string;
  evidenceScore0to100?: number;
  qualityBucket?: string;
  qualityScore0to100?: number;
  unsupportedOpen: number;
  driftOpen: boolean;
  conflictOpen: boolean;
  humanBadge?: string;
  /** Higher = review sooner */
  priorityScore: number;
  warnings: string[];
  urgency: CanonicalUrgency;
}

export interface CanonicalBoardFile {
  version: 1;
  updatedAt: string;
  items: CanonicalBoardItem[];
}

export async function readCanonicalBoard(paths: BrainPaths): Promise<CanonicalBoardFile | null> {
  try {
    const raw = await fs.readFile(paths.canonicalBoardJson, "utf8");
    return JSON.parse(raw) as CanonicalBoardFile;
  } catch {
    return null;
  }
}

export async function writeCanonicalBoard(paths: BrainPaths, f: CanonicalBoardFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.canonicalBoardJson), { recursive: true });
  await fs.writeFile(paths.canonicalBoardJson, JSON.stringify(f, null, 2), "utf8");
}

async function pendingProposalCounts(cfg: BrainConfig): Promise<Map<string, number>> {
  const paths = brainPaths(cfg.root);
  const map = new Map<string, number>();
  const files = await fg(
    path.join(paths.proposedWikiUpdatesDir, "*.md").replace(/\\/g, "/"),
    { onlyFiles: true }
  ).catch(() => [] as string[]);
  for (const abs of files) {
    try {
      const raw = await fs.readFile(abs, "utf8");
      const { data } = matter(raw);
      const target = (data as { target_wiki?: string }).target_wiki;
      if (typeof target === "string" && target.startsWith("wiki/")) {
        map.set(target, (map.get(target) ?? 0) + 1);
      }
    } catch {
      /* skip */
    }
  }
  return map;
}

export async function buildCanonicalBoard(
  cfg: BrainConfig,
  wikiRelPaths: string[],
  graph?: KnowledgeGraph | null
): Promise<CanonicalBoardFile> {
  const paths = brainPaths(cfg.root);
  const pq = await readPageQuality(paths);
  const ed = await readEvidenceDensity(paths);
  const hr = await readHumanReview(paths);
  const uns = await readUnsupportedClaims(paths);
  const conf = await readConflicts(paths);
  const drift = await readKnowledgeDrift(paths);
  const pending = await pendingProposalCounts(cfg);

  const pqBy = new Map((pq?.pages ?? []).map((p) => [p.path, p]));
  const edBy = new Map((ed?.pages ?? []).map((p) => [p.path, p]));
  const hrBy = new Map((hr?.pages ?? []).map((p) => [p.path, p]));

  const unsBy = new Map<string, number>();
  for (const u of uns.items) {
    if (u.status === "resolved" || u.status === "ignored") continue;
    unsBy.set(u.pagePath, (unsBy.get(u.pagePath) ?? 0) + 1);
  }
  const driftOpen = new Set(
    drift.items.filter((d) => d.status !== "resolved" && d.status !== "ignored").map((d) => d.pagePath)
  );
  const conflictPages = new Set<string>();
  for (const c of conf.items) {
    if (c.status === "resolved" || c.status === "ignored" || c.status === "accepted-as-tension")
      continue;
    conflictPages.add(c.sourceA);
    conflictPages.add(c.sourceB);
    if (c.wikiRef) conflictPages.add(c.wikiRef);
  }
  const hub = new Map<string, number>();
  if (graph) for (const n of graph.nodes) hub.set(n.id, n.hubScore);

  const items: CanonicalBoardItem[] = [];

  for (const rel of wikiRelPaths) {
    let title = path.basename(rel, ".md");
    let data: Record<string, unknown> = {};
    let mtime: number | undefined;
    try {
      const abs = path.join(cfg.root, rel);
      const st = await fs.stat(abs);
      mtime = st.mtimeMs;
      const raw = await fs.readFile(abs, "utf8");
      const parsed = matter(raw);
      data = parsed.data as Record<string, unknown>;
      title = (data.title as string) ?? title;
    } catch {
      continue;
    }

    const policy = parseWikiEditPolicy(data);
    const canonicalFm =
      data.canonical === true ||
      data.canonical === "true" ||
      data.canonical === "yes";

    const canonicalish = policy !== "open" || canonicalFm;
    const onBoard = canonicalish || (pending.get(rel) ?? 0) > 0;

    if (!onBoard) continue;

    const pr = pqBy.get(rel);
    const er = edBy.get(rel);
    const hrow = hrBy.get(rel);
    const uc = unsBy.get(rel) ?? 0;
    const dr = driftOpen.has(rel);
    const co = conflictPages.has(rel);
    const pend = pending.get(rel) ?? 0;

    let priority = 20;
    const warnings: string[] = [];
    if (policy === "locked") {
      priority += 25;
      warnings.push("Locked page — high trust bar.");
    } else if (policy === "manual_review") {
      priority += 18;
      warnings.push("Manual review policy.");
    }
    if (canonicalFm) {
      priority += 12;
      warnings.push("canonical frontmatter.");
    }
    if (pend > 0) {
      priority += 20 + pend * 5;
      warnings.push(`${pend} pending proposed update(s).`);
    }
    if (uc > 0) {
      priority += 10 + uc * 4;
      warnings.push(`${uc} open unsupported-claim flag(s).`);
    }
    if (dr) {
      priority += 14;
      warnings.push("Knowledge drift watch.");
    }
    if (co) {
      priority += 16;
      warnings.push("Open conflict touches this page.");
    }
    if (er?.bucket === "low") {
      priority += 12;
      warnings.push("Low evidence density (support depth).");
    } else if (er?.bucket === "moderate") {
      priority += 4;
    }
    if (pr?.bucket === "low") {
      priority += 10;
      warnings.push("Low page quality scorecard.");
    }
    if (hrow?.badge === "review-needed" || hrow?.badge === "outdated-human-review") {
      priority += 14;
      warnings.push(`Human review: ${hrow.badge.replace(/-/g, " ")}.`);
    }
    const hs = hub.get(rel) ?? 0;
    if (hs > 0.35) priority += 8;

    let urgency: CanonicalUrgency = "watch";
    if (priority >= 72) urgency = "attention";
    else if (priority < 38 && warnings.length <= 1) urgency = "ok";

    items.push({
      path: rel,
      title,
      policy,
      lockLabel: lockBadgeLabel(policy),
      isCanonicalFm: canonicalFm,
      pendingProposals: pend,
      wikiMtimeMs: mtime,
      evidenceBucket: er?.bucket,
      evidenceScore0to100: er?.score0to100,
      qualityBucket: pr?.bucket,
      qualityScore0to100: pr?.score0to100,
      unsupportedOpen: uc,
      driftOpen: dr,
      conflictOpen: co,
      humanBadge: hrow?.badge,
      priorityScore: Math.min(100, priority),
      warnings,
      urgency,
    });
  }

  items.sort((a, b) => b.priorityScore - a.priorityScore);

  const file: CanonicalBoardFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: items.slice(0, 100),
  };
  await writeCanonicalBoard(paths, file);
  return file;
}

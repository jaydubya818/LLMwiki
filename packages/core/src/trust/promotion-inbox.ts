import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { v4 as uuid } from "uuid";
import type { BrainPaths } from "../paths.js";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { readPromotionQueue, writePromotionQueue, type PromotionCandidate } from "../promotion/candidates.js";
import { appendLog } from "../log-append.js";

export type PromotionInboxStatus =
  | "new"
  | "reviewing"
  | "approved"
  | "rejected"
  | "deferred"
  | "promoted";

export type PromotionInboxType =
  | "output"
  | "wiki"
  | "review"
  | "synthesis"
  | "decision_memo"
  | "comparative"
  | "other";

export interface PromotionInboxItem {
  id: string;
  sourcePath: string;
  createdAt: string;
  candidateType: PromotionInboxType;
  rationale?: string;
  suggestedTarget?: string;
  status: PromotionInboxStatus;
  confidence?: "low" | "medium" | "high";
  promotedAt?: string;
  promotedWikiRelPath?: string;
  runId?: string;
  lineageId?: string;
}

export interface PromotionInboxFile {
  version: 2;
  items: PromotionInboxItem[];
}

function defaultInbox(): PromotionInboxFile {
  return { version: 2, items: [] };
}

export async function readPromotionInbox(paths: BrainPaths): Promise<PromotionInboxFile> {
  try {
    const raw = await fs.readFile(paths.promotionInboxJson, "utf8");
    const j = JSON.parse(raw) as PromotionInboxFile;
    if (!j.items) j.items = [];
    return j;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") return defaultInbox();
    throw e;
  }
}

export async function writePromotionInbox(
  paths: BrainPaths,
  inbox: PromotionInboxFile
): Promise<void> {
  await fs.mkdir(path.dirname(paths.promotionInboxJson), { recursive: true });
  await fs.writeFile(paths.promotionInboxJson, JSON.stringify(inbox, null, 2), "utf8");
}

/** Merge legacy promotion-candidates.json into inbox once. */
export async function ensureInboxMigratedFromLegacy(brainRoot: string, paths: BrainPaths): Promise<void> {
  const inbox = await readPromotionInbox(paths);
  const legacy = await readPromotionQueue(brainRoot);
  for (const c of legacy.candidates) {
    if (inbox.items.some((i) => i.sourcePath === c.relPath)) continue;
    inbox.items.push({
      id: uuid(),
      sourcePath: c.relPath,
      createdAt: c.addedAt,
      candidateType: c.kind === "wiki" ? "wiki" : "output",
      rationale: c.rationale,
      suggestedTarget: undefined,
      status: "new",
      confidence: c.confidence,
    });
  }
  await writePromotionInbox(paths, inbox);
}

export async function addInboxItem(
  paths: BrainPaths,
  item: Omit<PromotionInboxItem, "id" | "createdAt" | "status"> & {
    id?: string;
    status?: PromotionInboxStatus;
    createdAt?: string;
  }
): Promise<PromotionInboxItem> {
  const inbox = await readPromotionInbox(paths);
  const full: PromotionInboxItem = {
    id: item.id ?? uuid(),
    sourcePath: item.sourcePath,
    createdAt: item.createdAt ?? new Date().toISOString(),
    candidateType: item.candidateType,
    rationale: item.rationale,
    suggestedTarget: item.suggestedTarget,
    status: item.status ?? "new",
    confidence: item.confidence,
    runId: item.runId,
    lineageId: item.lineageId,
  };
  if (!inbox.items.some((i) => i.sourcePath === full.sourcePath && i.status === "new")) {
    inbox.items.push(full);
  }
  await writePromotionInbox(paths, inbox);
  return full;
}

export async function updateInboxItem(
  paths: BrainPaths,
  id: string,
  patch: Partial<PromotionInboxItem>
): Promise<PromotionInboxItem | null> {
  const inbox = await readPromotionInbox(paths);
  const idx = inbox.items.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  inbox.items[idx] = { ...inbox.items[idx]!, ...patch };
  await writePromotionInbox(paths, inbox);
  return inbox.items[idx]!;
}

/**
 * Promote: append synthesized section to target wiki page with provenance, or create new page under domain.
 */
export async function promoteInboxItemToWiki(
  cfg: BrainConfig,
  itemId: string,
  options: { targetWikiRel?: string; domain?: string; slug?: string } = {}
): Promise<{ wikiRel: string }> {
  const paths = brainPaths(cfg.root);
  const inbox = await readPromotionInbox(paths);
  const item = inbox.items.find((i) => i.id === itemId);
  if (!item) throw new Error("Inbox item not found");

  const srcAbs = path.join(cfg.root, item.sourcePath);
  const rawSrc = await fs.readFile(srcAbs, "utf8");
  const { content: body } = matter(rawSrc);

  const targetRel =
    options.targetWikiRel ??
    item.suggestedTarget ??
    (() => {
      const dom = options.domain ?? "topics";
      const slug =
        options.slug ??
        `promoted-${path.basename(item.sourcePath, ".md").slice(0, 60)}`;
      return `wiki/${dom}/${slug}.md`;
    })();

  const targetAbs = path.join(cfg.root, targetRel);
  const stamp = new Date().toISOString();
  const promoBlock = [
    "",
    `## Promotion merge (${stamp.slice(0, 10)})`,
    `_From inbox \`${item.id}\` · source \`${item.sourcePath}\`_`,
    "",
    body.trim(),
    "",
  ].join("\n");

  let merged: string;
  try {
    const existing = await fs.readFile(targetAbs, "utf8");
    const { content, data } = matter(existing);
    const fm = data as Record<string, unknown>;
    fm.last_updated = stamp.slice(0, 10);
    const promos = Array.isArray(fm.promotions_from)
      ? (fm.promotions_from as string[])
      : [];
    promos.push(item.sourcePath);
    fm.promotions_from = promos;
    merged = matter.stringify(`${content.trim()}${promoBlock}`, fm);
  } catch {
    merged = matter.stringify(promoBlock.trim(), {
      title: path.basename(targetRel, ".md"),
      type: "topic",
      domain: targetRel.split("/")[1] ?? "topics",
      status: "active",
      last_updated: stamp.slice(0, 10),
      sources: [item.sourcePath],
      promotions_from: [item.sourcePath],
      wiki_edit_policy: "manual_review",
    });
  }

  await fs.mkdir(path.dirname(targetAbs), { recursive: true });
  await fs.writeFile(targetAbs, merged, "utf8");
  item.status = "promoted";
  item.promotedAt = stamp;
  item.promotedWikiRelPath = targetRel;
  await writePromotionInbox(paths, inbox);

  await appendLog(
    paths,
    `promotion-inbox: ${item.id} → ${targetRel} (from ${item.sourcePath})`
  );

  const legacyQ = await readPromotionQueue(cfg.root);
  legacyQ.candidates = legacyQ.candidates.filter((c) => c.relPath !== item.sourcePath);
  await writePromotionQueue(cfg.root, legacyQ);

  return { wikiRel: targetRel };
}

export function inboxItemFromLegacyCandidate(c: PromotionCandidate): PromotionInboxItem {
  return {
    id: uuid(),
    sourcePath: c.relPath,
    createdAt: c.addedAt,
    candidateType: c.kind === "wiki" ? "wiki" : "output",
    rationale: c.rationale,
    status: "new",
    confidence: c.confidence,
  };
}

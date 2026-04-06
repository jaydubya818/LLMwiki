import fs from "node:fs/promises";
import path from "node:path";
import type { BrainPaths } from "../paths.js";
import { brainPaths } from "../paths.js";
import type { BrainConfig } from "../config.js";
import { readDecisionLedger } from "../trust/decision-ledger.js";
import { readEvidenceChangeAlerts } from "./evidence-change.js";
import { readKnowledgeDrift } from "../trust/knowledge-drift.js";
import { readConflicts } from "../trust/conflicts.js";
import { readOpenLoops } from "../trust/open-loops.js";
import { readSourceSupersession } from "./source-supersession.js";

export type DecisionSunsetStatus =
  | "new"
  | "reviewing"
  | "revalidated"
  | "superseded"
  | "ignored";

export interface DecisionSunsetHint {
  id: string;
  decisionWikiPath: string;
  decisionTitle: string;
  summary: string;
  whyFlagged: string[];
  /** Approx age in days from decision date or file mtime. */
  ageDaysApprox?: number;
  linkedDriftPages: string[];
  linkedConflictIds: string[];
  linkedEvidenceAlertIds: string[];
  linkedOpenLoopIds: string[];
  suggestedNext: string;
  status: DecisionSunsetStatus;
  updatedAt: string;
}

export interface DecisionSunsetFile {
  version: 1;
  updatedAt: string;
  hints: DecisionSunsetHint[];
}

export async function readDecisionSunset(paths: BrainPaths): Promise<DecisionSunsetFile | null> {
  try {
    const raw = await fs.readFile(paths.decisionSunsetJson, "utf8");
    return JSON.parse(raw) as DecisionSunsetFile;
  } catch {
    return null;
  }
}

export async function writeDecisionSunset(paths: BrainPaths, f: DecisionSunsetFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.decisionSunsetJson), { recursive: true });
  await fs.writeFile(
    paths.decisionSunsetJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

function daysSince(iso: string | undefined, fallbackMtime: number | undefined): number | undefined {
  if (iso) {
    const t = Date.parse(iso.includes("T") ? iso : `${iso}T12:00:00Z`);
    if (!Number.isNaN(t)) return Math.max(0, Math.floor((Date.now() - t) / 86400000));
  }
  if (fallbackMtime != null) {
    return Math.max(0, Math.floor((Date.now() - fallbackMtime) / 86400000));
  }
  return undefined;
}

/**
 * Advisory hints: old or stressed decisions that may deserve a human revisit.
 */
export async function buildDecisionSunsetHints(cfg: BrainConfig): Promise<DecisionSunsetFile> {
  const paths = brainPaths(cfg.root);
  const ledger = await readDecisionLedger(paths);
  const alerts = await readEvidenceChangeAlerts(paths);
  const drift = await readKnowledgeDrift(paths);
  const conflicts = await readConflicts(paths);
  const loops = await readOpenLoops(paths);
  const superSess = await readSourceSupersession(paths);

  const driftOpenPages = new Set<string>();
  for (const d of drift.items) {
    if (d.status === "resolved" || d.status === "ignored") continue;
    driftOpenPages.add(d.pagePath);
  }
  const conflictIdsByPage = new Map<string, string[]>();
  for (const c of conflicts.items) {
    if (c.status === "resolved" || c.status === "ignored" || c.status === "accepted-as-tension") continue;
    for (const p of [c.sourceA, c.sourceB, c.wikiRef].filter(Boolean) as string[]) {
      const arr = conflictIdsByPage.get(p) ?? [];
      arr.push(c.id);
      conflictIdsByPage.set(p, arr);
    }
  }
  const alertIdsByPage = new Map<string, string[]>();
  for (const a of alerts.alerts) {
    if (a.status !== "new" && a.status !== "seen") continue;
    const arr = alertIdsByPage.get(a.pagePath) ?? [];
    arr.push(a.id);
    alertIdsByPage.set(a.pagePath, arr);
  }
  const loopsForPath = new Map<string, string[]>();
  for (const l of loops.items) {
    if (l.status !== "open") continue;
    if (!l.sourcePath?.startsWith("wiki/")) continue;
    const arr = loopsForPath.get(l.sourcePath) ?? [];
    arr.push(l.id);
    loopsForPath.set(l.sourcePath, arr);
  }
  const supersededOlderSources = new Set<string>();
  for (const x of superSess?.items ?? []) {
    if (x.status === "suggested") supersededOlderSources.add(x.olderSource);
  }

  const prev = await readDecisionSunset(paths);
  const preservedById = new Map((prev?.hints ?? []).map((h) => [h.id, h]));

  const hints: DecisionSunsetHint[] = [];
  const nowIso = new Date().toISOString();

  for (const d of ledger.decisions) {
    if (d.status !== "accepted" && d.status !== "proposed") continue;
    let mtime: number | undefined;
    try {
      const st = await fs.stat(path.join(cfg.root, d.wikiPath));
      mtime = st.mtimeMs;
    } catch {
      /* missing file */
    }
    const age = daysSince(d.date, mtime);
    const why: string[] = [];
    if (age != null && age > 365) why.push("Decision is older than ~12 months (date or file mtime).");
    if (age != null && age > 180 && age <= 365) why.push("Decision is older than ~6 months — periodic check.");

    const linkedDriftPages: string[] = [];
    if (driftOpenPages.has(d.wikiPath)) {
      why.push("Open knowledge-drift item on this page.");
      linkedDriftPages.push(d.wikiPath);
    }
    const cids = conflictIdsByPage.get(d.wikiPath) ?? [];
    if (cids.length) why.push("Open conflict still references this page.");
    const eids = alertIdsByPage.get(d.wikiPath) ?? [];
    if (eids.length) why.push("Evidence weakening / shift alert flagged for this page.");
    const lids = loopsForPath.get(d.wikiPath) ?? [];
    if (lids.length) why.push("Unresolved open loops attached to this page.");

    const related = new Set<string>(d.related ?? []);
    for (const rp of related) {
      if (driftOpenPages.has(rp)) {
        why.push(`Related page has open drift: ${rp}`);
        linkedDriftPages.push(rp);
      }
    }

    const decisionSources = d.sources ?? [];
    if (decisionSources.some((s) => supersededOlderSources.has(s))) {
      why.push(
        "Decision cites source(s) flagged as older/superseded in the supersession queue — verify citations."
      );
    }

    if (why.length === 0) continue;

    const id = `sunset-${d.id}`;
    const preserved = preservedById.get(id);
    const hint: DecisionSunsetHint = {
      id,
      decisionWikiPath: d.wikiPath,
      decisionTitle: d.title,
      summary: `Revisit “${d.title}” — ${why[0] ?? "signals changed"}`,
      whyFlagged: why,
      ageDaysApprox: age,
      linkedDriftPages: [...new Set(linkedDriftPages)].slice(0, 12),
      linkedConflictIds: cids.slice(0, 8),
      linkedEvidenceAlertIds: eids.slice(0, 8),
      linkedOpenLoopIds: lids.slice(0, 8),
      suggestedNext: "Skim decision + linked drift/conflicts; update status or add superseding memo.",
      status: "new",
      updatedAt: nowIso,
    };

    if (
      preserved &&
      (preserved.status === "reviewing" ||
        preserved.status === "revalidated" ||
        preserved.status === "superseded" ||
        preserved.status === "ignored")
    ) {
      hints.push({
        ...hint,
        status: preserved.status,
        summary: preserved.summary || hint.summary,
        suggestedNext: preserved.suggestedNext || hint.suggestedNext,
        updatedAt: preserved.updatedAt,
      });
    } else {
      hints.push(hint);
    }
  }

  const merged = new Map<string, DecisionSunsetHint>();
  for (const h of hints) merged.set(h.id, h);
  for (const h of prev?.hints ?? []) {
    if (!merged.has(h.id) && h.status !== "new") merged.set(h.id, h);
  }

  const file: DecisionSunsetFile = {
    version: 1,
    updatedAt: nowIso,
    hints: Array.from(merged.values()).sort((a, b) => (b.ageDaysApprox ?? 0) - (a.ageDaysApprox ?? 0)),
  };
  await writeDecisionSunset(paths, file);
  return file;
}

const sunsetUpdateChains = new Map<string, Promise<unknown>>();

function enqueueDecisionSunsetUpdate<T>(fileKey: string, fn: () => Promise<T>): Promise<T> {
  const prev = sunsetUpdateChains.get(fileKey) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  sunsetUpdateChains.set(fileKey, run.then(() => undefined, () => undefined));
  return run;
}

export type DecisionSunsetStatusUpdate = {
  rec: DecisionSunsetHint | null;
  /** Snapshot of the hint before mutation (same object shape); null when id not found. */
  before: DecisionSunsetHint | null;
};

/**
 * Serialized per paths.decisionSunsetJson so concurrent updates do not clobber each other.
 * Returns `{ before, rec }` from a single read-modify-write (no separate pre-read for status transitions).
 */
export async function updateDecisionSunsetStatus(
  paths: BrainPaths,
  id: string,
  status: DecisionSunsetStatus,
  patch?: Partial<Pick<DecisionSunsetHint, "summary" | "suggestedNext">>
): Promise<DecisionSunsetStatusUpdate> {
  return enqueueDecisionSunsetUpdate(paths.decisionSunsetJson, async () => {
    const f =
      (await readDecisionSunset(paths)) ??
      ({ version: 1, updatedAt: new Date().toISOString(), hints: [] } as DecisionSunsetFile);
    const idx = f.hints.findIndex((h) => h.id === id);
    if (idx < 0) return { rec: null, before: null };
    const before = { ...f.hints[idx]! };
    f.hints[idx] = {
      ...f.hints[idx]!,
      ...patch,
      status,
      updatedAt: new Date().toISOString(),
    };
    await writeDecisionSunset(paths, f);
    return { rec: f.hints[idx]!, before };
  });
}

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { v4 as uuid } from "uuid";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";
import { readPageQuality } from "../trust/page-quality.js";
import { readUnsupportedClaims } from "../trust/unsupported-claims.js";
import { readKnowledgeDrift } from "../trust/knowledge-drift.js";
import { readConflicts } from "../trust/conflicts.js";
import { readWikiTrace } from "../trust/trace.js";

/** Compact, inspectable fingerprint — not a precision metric. */
export interface PageEvidenceFingerprint {
  pagePath: string;
  qualityScore: number;
  qualityBucket: string;
  unsupportedOpen: number;
  hasDrift: boolean;
  hasConflict: boolean;
  traceSourceRefs: number;
  updatedAt: string;
}

export interface EvidenceBaselineFile {
  version: 1;
  updatedAt: string;
  pages: Record<string, PageEvidenceFingerprint>;
}

export type EvidenceAlertStatus = "new" | "seen" | "resolved" | "ignored";

export interface EvidenceChangeAlert {
  id: string;
  pagePath: string;
  changeSummary: string;
  previous: Partial<PageEvidenceFingerprint>;
  current: Partial<PageEvidenceFingerprint>;
  why: string;
  severity: "low" | "medium" | "high";
  createdAt: string;
  status: EvidenceAlertStatus;
}

export interface EvidenceChangeAlertsFile {
  version: 1;
  updatedAt: string;
  alerts: EvidenceChangeAlert[];
}

export async function readEvidenceBaseline(paths: BrainPaths): Promise<EvidenceBaselineFile | null> {
  try {
    const raw = await fs.readFile(paths.evidenceBaselineJson, "utf8");
    return JSON.parse(raw) as EvidenceBaselineFile;
  } catch {
    return null;
  }
}

export async function writeEvidenceBaseline(paths: BrainPaths, f: EvidenceBaselineFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.evidenceBaselineJson), { recursive: true });
  await fs.writeFile(
    paths.evidenceBaselineJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

export async function readEvidenceChangeAlerts(
  paths: BrainPaths
): Promise<EvidenceChangeAlertsFile> {
  try {
    const raw = await fs.readFile(paths.evidenceChangeAlertsJson, "utf8");
    const j = JSON.parse(raw) as EvidenceChangeAlertsFile;
    if (!j.alerts) j.alerts = [];
    return j;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), alerts: [] };
  }
}

export async function writeEvidenceChangeAlerts(
  paths: BrainPaths,
  f: EvidenceChangeAlertsFile
): Promise<void> {
  await fs.mkdir(path.dirname(paths.evidenceChangeAlertsJson), { recursive: true });
  await fs.writeFile(
    paths.evidenceChangeAlertsJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

export async function updateEvidenceAlertStatus(
  paths: BrainPaths,
  id: string,
  status: EvidenceAlertStatus
): Promise<void> {
  const f = await readEvidenceChangeAlerts(paths);
  const a = f.alerts.find((x) => x.id === id);
  if (a) a.status = status;
  await writeEvidenceChangeAlerts(paths, f);
}

async function fingerprintPage(
  cfg: BrainConfig,
  pagePath: string,
  pq: Awaited<ReturnType<typeof readPageQuality>>,
  uns: Awaited<ReturnType<typeof readUnsupportedClaims>>,
  drift: Awaited<ReturnType<typeof readKnowledgeDrift>>,
  conflicts: Awaited<ReturnType<typeof readConflicts>>
): Promise<PageEvidenceFingerprint> {
  const paths = brainPaths(cfg.root);
  const row = pq?.pages.find((p) => p.path === pagePath);
  let traceRefs = 0;
  const tr = await readWikiTrace(paths, pagePath);
  if (tr) {
    for (const s of tr.sections) traceRefs += s.sources?.length ?? 0;
  }

  const unsupportedOpen = uns.items.filter(
    (u) => u.pagePath === pagePath && u.status !== "resolved" && u.status !== "ignored"
  ).length;

  const hasDrift = drift.items.some(
    (d) => d.pagePath === pagePath && d.status !== "resolved" && d.status !== "ignored"
  );

  let hasConflict = false;
  for (const c of conflicts.items) {
    if (c.status === "resolved" || c.status === "ignored" || c.status === "accepted-as-tension") continue;
    if (c.sourceA === pagePath || c.sourceB === pagePath || c.wikiRef === pagePath) {
      hasConflict = true;
      break;
    }
  }

  let fmUpdated = new Date().toISOString();
  try {
    const raw = await fs.readFile(path.join(cfg.root, pagePath), "utf8");
    const fm = matter(raw).data as { last_updated?: string };
    if (fm.last_updated) fmUpdated = `${fm.last_updated}T12:00:00Z`;
  } catch {
    /* */
  }

  return {
    pagePath,
    qualityScore: row?.score0to100 ?? 50,
    qualityBucket: row?.bucket ?? "medium",
    unsupportedOpen,
    hasDrift,
    hasConflict,
    traceSourceRefs: traceRefs,
    updatedAt: fmUpdated,
  };
}

export async function refreshEvidenceChangeAlerts(
  cfg: BrainConfig,
  wikiRelPaths: string[]
): Promise<EvidenceChangeAlertsFile> {
  const paths = brainPaths(cfg.root);
  const pq = await readPageQuality(paths);
  const uns = await readUnsupportedClaims(paths);
  const drift = await readKnowledgeDrift(paths);
  const conflicts = await readConflicts(paths);

  const prev = (await readEvidenceBaseline(paths)) ?? {
    version: 1 as const,
    updatedAt: new Date().toISOString(),
    pages: {},
  };

  const alertsFile = await readEvidenceChangeAlerts(paths);
  const newAlerts: EvidenceChangeAlert[] = [];

  const cap = Math.min(wikiRelPaths.length, 200);
  for (let i = 0; i < cap; i++) {
    const p = wikiRelPaths[i]!;
    const cur = await fingerprintPage(cfg, p, pq, uns, drift, conflicts);
    const old = prev.pages[p];
    prev.pages[p] = cur;

    if (!old) continue;

    const parts: string[] = [];
    let severity: EvidenceChangeAlert["severity"] = "low";
    const why: string[] = [];

    if (old.qualityScore - cur.qualityScore >= 12) {
      parts.push("quality score dropped");
      why.push(`Quality heuristic ${old.qualityScore} → ${cur.qualityScore} (advisory).`);
      severity = "medium";
    }
    if (cur.qualityScore - old.qualityScore >= 12) {
      parts.push("quality score improved");
      why.push(`Quality heuristic ${old.qualityScore} → ${cur.qualityScore}.`);
    }

    if (cur.unsupportedOpen > old.unsupportedOpen) {
      parts.push("more unsupported claims");
      why.push(`Unsupported count ${old.unsupportedOpen} → ${cur.unsupportedOpen}.`);
      severity = cur.unsupportedOpen - old.unsupportedOpen >= 2 ? "high" : "medium";
    }
    if (cur.unsupportedOpen < old.unsupportedOpen) {
      parts.push("fewer unsupported claims");
      why.push(`Unsupported count ${old.unsupportedOpen} → ${cur.unsupportedOpen}.`);
    }

    if (!old.hasDrift && cur.hasDrift) {
      parts.push("drift flagged");
      why.push("Drift scanner now marks this page.");
      severity = "high";
    }
    if (old.hasDrift && !cur.hasDrift) {
      parts.push("drift cleared");
      why.push("Drift item resolved or removed.");
    }

    if (!old.hasConflict && cur.hasConflict) {
      parts.push("conflict involves page");
      severity = "high";
      why.push("New open conflict references this page.");
    }

    if (cur.traceSourceRefs - old.traceSourceRefs >= 2) {
      parts.push("more trace sources");
      why.push(`Trace ref count ${old.traceSourceRefs} → ${cur.traceSourceRefs}.`);
    }
    if (old.traceSourceRefs - cur.traceSourceRefs >= 2) {
      parts.push("fewer trace sources");
      why.push(`Trace ref count ${old.traceSourceRefs} → ${cur.traceSourceRefs} — check supersession.`);
      severity = "medium";
    }

    if (parts.length === 0) continue;

    const summary = parts.join("; ");
    newAlerts.push({
      id: uuid(),
      pagePath: p,
      changeSummary: summary,
      previous: {
        qualityScore: old.qualityScore,
        unsupportedOpen: old.unsupportedOpen,
        hasDrift: old.hasDrift,
        hasConflict: old.hasConflict,
        traceSourceRefs: old.traceSourceRefs,
      },
      current: {
        qualityScore: cur.qualityScore,
        unsupportedOpen: cur.unsupportedOpen,
        hasDrift: cur.hasDrift,
        hasConflict: cur.hasConflict,
        traceSourceRefs: cur.traceSourceRefs,
      },
      why: why.join(" "),
      severity,
      createdAt: new Date().toISOString(),
      status: "new",
    });
  }

  await writeEvidenceBaseline(paths, prev);

  const merged = [...newAlerts, ...alertsFile.alerts].slice(0, 300);
  const out: EvidenceChangeAlertsFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    alerts: merged,
  };
  await writeEvidenceChangeAlerts(paths, out);
  return out;
}

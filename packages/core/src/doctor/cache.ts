import fs from "node:fs/promises";
import path from "node:path";
import type { BrainConfig } from "../config.js";
import type { BrainPaths } from "../paths.js";

export const DOCTOR_CACHE_VERSION = 1 as const;

/** Treat doctor snapshot as stale for dashboard hints after this many hours */
export const DOCTOR_CACHE_STALE_HOURS = 48;

export type CacheVerdict = "ready" | "warnings" | "blocked";

export interface LastDoctorSectionStatus {
  id: string;
  worst: "pass" | "warn" | "fail";
  pass: number;
  warn: number;
  fail: number;
}

export interface LastDoctorCache {
  version: typeof DOCTOR_CACHE_VERSION;
  generatedAt: string;
  verdict: CacheVerdict;
  readinessLabel: string;
  summary: string;
  vaultPath: string;
  vaultName: string;
  vaultNameSource: string;
  sectionStatuses: LastDoctorSectionStatus[];
  nextActions: string[];
  reportPath?: string;
  failCount: number;
  warnCount: number;
  passCount: number;
  /** Wiki paths with uncommitted changes when doctor ran */
  pendingWikiCountAtRun: number;
}

/** Compact report shape for persistence (avoids importing run-doctor). */
export interface DoctorReportForCache {
  generatedAt: string;
  vaultRoot: string;
  summary: CacheVerdict;
  summaryLine: string;
  nextActions: string[];
  sections: { title: string; checks: { status: "pass" | "warn" | "fail" }[] }[];
}

function sectionStatuses(
  sections: DoctorReportForCache["sections"]
): LastDoctorSectionStatus[] {
  return sections.map((sec) => {
    let pass = 0;
    let warn = 0;
    let fail = 0;
    let worst: "pass" | "warn" | "fail" = "pass";
    for (const c of sec.checks) {
      if (c.status === "fail") {
        fail++;
        worst = "fail";
      } else if (c.status === "warn") {
        warn++;
        if (worst === "pass") worst = "warn";
      } else pass++;
    }
    return { id: sec.title, worst, pass, warn, fail };
  });
}

function countAll(report: DoctorReportForCache): {
  fail: number;
  warn: number;
  pass: number;
} {
  let fail = 0;
  let warn = 0;
  let pass = 0;
  for (const sec of report.sections) {
    for (const c of sec.checks) {
      if (c.status === "fail") fail++;
      else if (c.status === "warn") warn++;
      else pass++;
    }
  }
  return { fail, warn, pass };
}

export function buildLastDoctorCache(
  report: DoctorReportForCache,
  cfg: BrainConfig,
  pendingWikiCountAtRun: number,
  reportPath?: string
): LastDoctorCache {
  const { fail, warn, pass } = countAll(report);
  return {
    version: DOCTOR_CACHE_VERSION,
    generatedAt: report.generatedAt,
    verdict: report.summary,
    readinessLabel: report.summaryLine,
    summary: report.summaryLine,
    vaultPath: report.vaultRoot,
    vaultName: cfg.vaultName,
    vaultNameSource: cfg.vaultNameSource,
    sectionStatuses: sectionStatuses(report.sections),
    nextActions: report.nextActions,
    reportPath,
    failCount: fail,
    warnCount: warn,
    passCount: pass,
    pendingWikiCountAtRun,
  };
}

export interface DoctorSavedArtifacts {
  markdownPath?: string;
  lastDoctorJsonPath?: string;
  cacheUpdated: boolean;
}

/**
 * Writes markdown report and `.brain/last-doctor.json` when `saveReport` is true.
 * Mutates `artifacts` with paths and cacheUpdated.
 */
export async function persistDoctorMarkdownAndCache(
  paths: BrainPaths,
  cfg: BrainConfig,
  report: DoctorReportForCache,
  markdownBody: string,
  pendingWikiCountAtRun: number,
  artifacts: DoctorSavedArtifacts
): Promise<void> {
  artifacts.cacheUpdated = false;
  let reportPath: string | undefined;

  try {
    const dir = path.join(paths.outputs, "reports");
    await fs.mkdir(dir, { recursive: true });
    const stamp = doctorReportTimestampLocal();
    reportPath = path.join(dir, `doctor-${stamp}.md`);
    await fs.writeFile(reportPath, markdownBody, "utf8");
    artifacts.markdownPath = reportPath;
  } catch {
    /* markdown optional */
  }

  try {
    const cache = buildLastDoctorCache(report, cfg, pendingWikiCountAtRun, reportPath);
    const out = paths.lastDoctorJson;
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, JSON.stringify(cache, null, 2), "utf8");
    artifacts.lastDoctorJsonPath = out;
    artifacts.cacheUpdated = true;
  } catch {
    /* cache write failed — keep prior file if any */
  }
}

function doctorReportTimestampLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export async function readLastDoctorCache(
  paths: BrainPaths
): Promise<LastDoctorCache | null> {
  try {
    const raw = await fs.readFile(paths.lastDoctorJson, "utf8");
    const j = JSON.parse(raw) as LastDoctorCache;
    if (j.version !== DOCTOR_CACHE_VERSION || typeof j.generatedAt !== "string") {
      return null;
    }
    return j;
  } catch {
    return null;
  }
}

export interface DoctorStaleContext {
  pendingWikiCountNow: number;
  lastIngestAt?: string;
  lastLintAt?: string;
  lastReviewAt?: string;
}

export function computeDoctorCacheHints(
  cache: LastDoctorCache,
  ctx: DoctorStaleContext
): { staleByAge: boolean; hints: string[] } {
  const hints: string[] = [];
  const cacheMs = Date.parse(cache.generatedAt);
  if (Number.isNaN(cacheMs)) {
    return { staleByAge: true, hints: ["Invalid doctor cache timestamp — run brain doctor again."] };
  }

  const ageHours = (Date.now() - cacheMs) / (3600 * 1000);
  const staleByAge = ageHours >= DOCTOR_CACHE_STALE_HOURS;
  if (staleByAge) {
    hints.push(
      `Doctor snapshot is older than ${DOCTOR_CACHE_STALE_HOURS}h — run brain doctor for a fresh readiness check.`
    );
  }

  const after = (iso?: string) => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return !Number.isNaN(t) && t > cacheMs;
  };

  if (after(ctx.lastIngestAt)) {
    hints.push("Doctor ran before latest ingest — run doctor again after your ingest cycle.");
  }
  if (after(ctx.lastLintAt)) {
    hints.push("Doctor ran before latest lint.");
  }
  if (after(ctx.lastReviewAt)) {
    hints.push("Doctor ran before latest weekly review.");
  }

  if (
    ctx.pendingWikiCountNow > cache.pendingWikiCountAtRun &&
    ctx.pendingWikiCountNow > 0
  ) {
    hints.push(
      "Doctor predates pending wiki changes — re-run after Diff/approve when the tree matches expectations."
    );
  }

  return { staleByAge, hints };
}

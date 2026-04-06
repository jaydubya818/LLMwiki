import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { simpleGit } from "simple-git";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";
import { parseWikiEditPolicy, type WikiEditPolicy } from "./canonical-lock.js";
import { getWikiFileAtHead } from "../git/service.js";
import { readGovernanceSettings } from "../governance/governance-settings.js";
import { readSnapshotBundles } from "../governance/snapshot-bundles.js";
import { readGovernanceActionLog } from "../governance/governance-capture.js";
import { readHumanOverrides } from "../governance/human-overrides.js";
import { readCanonPromotions } from "../governance/canon-promotions.js";
import { readCanonAdmission } from "../governance/canon-admission.js";

export type CanonGuardVerdict = "ok" | "warn" | "high_attention";

export type CanonGuardDiffScope = "both" | "staged" | "unstaged";

export interface CanonGuardFinding {
  path: string;
  verdict: CanonGuardVerdict;
  /** Human-readable lines */
  reasons: string[];
  trustFieldChanges: string[];
  contentChanged: boolean;
  trustEscalation: boolean;
  snapshotRecent: boolean;
  snapshotAgeDays: number | null;
  latestSnapshotArtifact?: string;
  governanceHints: string[];
  recommendations: string[];
}

export interface CanonGuardReport {
  generatedAt: string;
  scope: CanonGuardDiffScope;
  findings: CanonGuardFinding[];
  maxVerdict: CanonGuardVerdict;
  skippedOpenOnly: number;
  wikiPathsScanned: number;
  /** Message when git unavailable */
  gitNote?: string;
  /** Open / low-trust paths skipped due to ignore rules (high-trust still scanned). */
  ignoredNoiseCount: number;
  /** Matched an ignore rule but file is canon/locked or has trust deltas — still scanned. */
  ignoredHighTrustBypassCount: number;
  respectIgnore: boolean;
  /** Sample of ignored paths (see --verbose-ignored). */
  ignoredPathsSample: string[];
}

export interface LastCanonGuardCache {
  version: 1;
  updatedAt: string;
  maxVerdict: CanonGuardVerdict;
  findingCount: number;
  paths: string[];
  highAttentionPaths: string[];
  summaryLine: string;
  ignoredNoiseCount?: number;
  respectIgnore?: boolean;
}

const TRUST_FM_KEYS = [
  "wiki_edit_policy",
  "canonical",
  "human_reviewed",
  "human_reviewed_at",
  "human_reviewed_by",
  "status",
  "type",
  "include_in_ledger",
  "canon_promotion_id",
  "promotions_from",
] as const;

const TRAIL_HOURS = 72;

function normFmVal(_key: string, v: unknown): string {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function policyRank(p: WikiEditPolicy): number {
  if (p === "open") return 0;
  if (p === "manual_review") return 1;
  return 2;
}

function isCanonicalTruth(fm: Record<string, unknown>): boolean {
  const c = fm.canonical;
  return c === true || c === "true" || c === "yes";
}

function isHighTrustFm(fm: Record<string, unknown>): boolean {
  return parseWikiEditPolicy(fm) !== "open" || isCanonicalTruth(fm);
}

function trustFieldsChanged(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const k of TRUST_FM_KEYS) {
    const a = normFmVal(k, before[k]);
    const b = normFmVal(k, after[k]);
    if (a !== b) out.push(`${k}: ${a || "∅"} → ${b || "∅"}`);
  }
  return out;
}

function trustEscalated(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  if (policyRank(parseWikiEditPolicy(after)) > policyRank(parseWikiEditPolicy(before))) return true;
  if (isCanonicalTruth(after) && !isCanonicalTruth(before)) return true;
  return false;
}

function normRepoRel(p: string): string {
  return p.replace(/^\/+/, "").replace(/\\/g, "/");
}

function pathMatchesCanonGuardIgnore(repoRel: string, prefixes: string[], exactPaths: string[]): boolean {
  const n = normRepoRel(repoRel);
  for (const e of exactPaths) {
    if (n === normRepoRel(e)) return true;
  }
  for (let pr of prefixes) {
    pr = normRepoRel(pr).replace(/\/$/, "");
    if (!pr) continue;
    if (n === pr || n.startsWith(`${pr}/`)) return true;
  }
  return false;
}

async function listWikiMdToScan(cfg: BrainConfig, scope: CanonGuardDiffScope): Promise<{ paths: string[]; gitNote?: string }> {
  const prefix = cfg.wikiGitPrefix.replace(/\/$/, "");
  const set = new Set<string>();

  const addLines = (text: string) => {
    for (const line of text.split(/\r?\n/)) {
      const p = line.trim();
      if (!p || !p.endsWith(".md")) continue;
      if (p !== prefix && !p.startsWith(`${prefix}/`)) continue;
      set.add(p);
    }
  };

  try {
    const git = simpleGit(cfg.gitRoot);
    if (scope === "both" || scope === "unstaged") {
      const u = await git.raw(["diff", "--name-only", "--", prefix]);
      addLines(u);
    }
    if (scope === "both" || scope === "staged") {
      const s = await git.raw(["diff", "--cached", "--name-only", "--", prefix]);
      addLines(s);
    }
    if (scope === "both" || scope === "unstaged") {
      const st = await git.status();
      for (const f of st.files) {
        if (!f.path.endsWith(".md")) continue;
        if (f.path !== prefix && !f.path.startsWith(`${prefix}/`)) continue;
        if ((f.index === "?" || String(f.index) === "?") && String(f.working_dir) === "?") {
          set.add(f.path);
        }
      }
    }
    return { paths: [...set].sort() };
  } catch {
    return { paths: [], gitNote: "Git not available or not a repo — no changed-path detection." };
  }
}

async function governanceTrailHints(paths: BrainPaths, pageNorm: string, now: number): Promise<string[]> {
  const hints: string[] = [];
  const sinceMs = now - TRAIL_HOURS * 3600000;

  try {
    const log = await readGovernanceActionLog(paths);
    for (const e of log.entries.slice(0, 200)) {
      if (Date.parse(e.at) < sinceMs) continue;
      if (e.relatedPaths?.some((p) => p.replace(/^\//, "") === pageNorm)) {
        hints.push(`Action log (${e.at.slice(0, 16)}): ${e.workflow} / ${e.action}`);
        break;
      }
    }
  } catch {
    /* */
  }

  try {
    const ho = await readHumanOverrides(paths);
    for (const o of ho.items.slice(0, 120)) {
      if (Date.parse(o.createdAt) < sinceMs) continue;
      if (o.relatedPath.replace(/^\//, "") === pageNorm) {
        hints.push(`Human override (${o.createdAt.slice(0, 16)}): ${o.overrideType}`);
        break;
      }
    }
  } catch {
    /* */
  }

  try {
    const prom = await readCanonPromotions(paths);
    for (const p of prom.items) {
      if (Date.parse(p.updatedAt) < sinceMs) continue;
      if (p.proposedTargetCanonicalPage.replace(/^\//, "") === pageNorm) {
        hints.push(`Canon promotion (${p.updatedAt.slice(0, 16)}): ${p.status}`);
        break;
      }
    }
  } catch {
    /* */
  }

  try {
    const adm = await readCanonAdmission(paths);
    const row = adm?.records.find((r) => r.targetPage === pageNorm);
    if (row && Date.parse(row.updatedAt) >= sinceMs) {
      hints.push(`Canon admission updated (${row.updatedAt.slice(0, 16)}): ${row.finalDecision ?? "—"}`);
    }
  } catch {
    /* */
  }

  return hints;
}

function verdictRank(v: CanonGuardVerdict): number {
  if (v === "ok") return 0;
  if (v === "warn") return 1;
  return 2;
}

function maxVerdict(a: CanonGuardVerdict, b: CanonGuardVerdict): CanonGuardVerdict {
  return verdictRank(a) >= verdictRank(b) ? a : b;
}

export async function runCanonGuard(
  cfg: BrainConfig,
  options: {
    scope?: CanonGuardDiffScope;
    /** Restrict to these repo-relative paths if non-empty */
    pathsOnly?: string[];
    respectIgnore?: boolean;
    verboseIgnored?: boolean;
  } = {}
): Promise<CanonGuardReport> {
  const paths = brainPaths(cfg.root);
  const settings = await readGovernanceSettings(paths);
  const scope = options.scope ?? "both";
  const { paths: changed, gitNote } = await listWikiMdToScan(cfg, scope);
  let toScan = changed;
  if (options.pathsOnly?.length) {
    const want = new Set(options.pathsOnly.map((p) => p.replace(/^\//, "")));
    toScan = toScan.filter((p) => want.has(p));
  }

  const respectIgnore = options.respectIgnore !== false;
  const prefixes = settings.canonGuardIgnorePrefixes ?? [];
  const exactList = settings.canonGuardIgnorePaths ?? [];

  const bundle = await readSnapshotBundles(paths);
  const snapEntries = bundle.entries;
  const maxAgeDays = Math.max(1, settings.snapshotMaxAgeDaysForCanon);

  const findings: CanonGuardFinding[] = [];
  let skippedOpenOnly = 0;
  let ignoredNoiseCount = 0;
  let ignoredHighTrustBypassCount = 0;
  const ignoredPathsSample: string[] = [];
  const verboseIgnored = !!options.verboseIgnored;
  const now = Date.now();

  for (const repoRel of toScan) {
    const abs = path.join(cfg.gitRoot, repoRel);
    let afterRaw: string;
    try {
      afterRaw = await fs.readFile(abs, "utf8");
    } catch {
      continue;
    }
    const beforeRaw = await getWikiFileAtHead(cfg, repoRel);
    const { data: da, content: ca } = matter(afterRaw);
    const { data: db, content: cb } = matter(beforeRaw || "");
    const afterFm = { ...(da as Record<string, unknown>) };
    const beforeFm = { ...(db as Record<string, unknown>) };
    const bodyChanged = ca.trim() !== cb.trim();
    const deltas = trustFieldsChanged(beforeFm, afterFm);
    const escalated = trustEscalated(beforeFm, afterFm);
    const hiBefore = isHighTrustFm(beforeFm);
    const hiAfter = isHighTrustFm(afterFm);

    const ignoreMatch =
      respectIgnore &&
      (prefixes.length > 0 || exactList.length > 0) &&
      pathMatchesCanonGuardIgnore(repoRel, prefixes, exactList);

    if (ignoreMatch) {
      const lowTrustNoise = !hiBefore && !hiAfter && deltas.length === 0 && !escalated;
      if (lowTrustNoise) {
        ignoredNoiseCount++;
        if (verboseIgnored && ignoredPathsSample.length < 40) {
          ignoredPathsSample.push(repoRel);
        }
        continue;
      }
      ignoredHighTrustBypassCount++;
    }

    if (!hiBefore && !hiAfter && deltas.length === 0) {
      skippedOpenOnly++;
      continue;
    }

    const pageKey = repoRel.replace(/^\//, "");
    const snapLatest = snapEntries.filter((e) => e.pagePath === pageKey)[0];
    let snapAgeDays: number | null = null;
    let snapshotRecent = false;
    let latestArtifact: string | undefined;
    if (snapLatest) {
      snapAgeDays = (Date.now() - Date.parse(snapLatest.createdAt)) / 86400000;
      snapshotRecent = snapAgeDays * 86400000 <= maxAgeDays * 86400000 && snapAgeDays >= 0;
      latestArtifact = snapLatest.artifactRelPath;
    }

    const govHints = await governanceTrailHints(paths, pageKey, now);
    const hasTrail = govHints.length > 0;

    const recs: string[] = [];
    let verdict: CanonGuardVerdict = "ok";
    const reasons: string[] = [];

    if (deltas.length) {
      reasons.push(`Trust frontmatter changed (${deltas.length} field(s)).`);
      if (escalated) reasons.push("Policy or canonical flag escalated toward higher trust / lock.");
    }
    if (bodyChanged && (hiBefore || hiAfter)) {
      reasons.push("Body content changed on a page that is or was canon/locked/manual-review.");
    }
    if (!snapshotRecent && (hiAfter || hiBefore) && bodyChanged) {
      reasons.push(
        snapLatest
          ? `No snapshot within ${maxAgeDays}d (latest ~${snapAgeDays?.toFixed(1)}d ago).`
          : "No snapshot on file for this page."
      );
      recs.push(`Run: brain snapshot ${pageKey} -m "pre-commit canon guard"`);
    }

    if (bodyChanged && (hiAfter || hiBefore) && !snapshotRecent) {
      if (settings.canonGuardRequireRecentSnapshot) {
        verdict = maxVerdict(verdict, "high_attention");
        reasons.push("Settings flag: high-trust content edit without recent snapshot.");
      } else {
        verdict = maxVerdict(verdict, "warn");
      }
    }

    if (deltas.length > 0) {
      if (settings.canonGuardStrictTrustDelta && !hasTrail) {
        verdict = maxVerdict(verdict, "high_attention");
        reasons.push("Strict mode: trust-field edit with no recent governance trail (~72h).");
      } else if (!hasTrail) {
        verdict = maxVerdict(verdict, "warn");
        reasons.push("Trust metadata changed off-dashboard — no matching recent action log / override.");
      }
    }

    if (escalated && !hasTrail) {
      verdict = maxVerdict(verdict, "high_attention");
      reasons.push("Trust escalation without recent governance entries (~72h).");
      recs.push("If intentional: record a human override or run canon admission / council review.");
    } else if (escalated && hasTrail) {
      verdict = maxVerdict(verdict, "warn");
      reasons.push("Trust escalation — recent governance trail present; confirm intentional.");
    }

    if (hasTrail) {
      reasons.push(`Governance trail (last ~72h): ${govHints.join(" · ")}`);
      if (verdict === "ok" || verdict === "warn") {
        recs.push("Recent dashboard/governance activity matches this path — more traceable.");
      }
    } else if (verdict !== "ok") {
      recs.push("Consider: canon council, admission checklist, or explicit override journal entry.");
    }

    if (verdict === "ok" && reasons.length === 0) {
      reasons.push("High-trust page in diff — snapshot and governance look adequate for this pass.");
    }

    findings.push({
      path: repoRel,
      verdict,
      reasons,
      trustFieldChanges: deltas,
      contentChanged: bodyChanged,
      trustEscalation: escalated,
      snapshotRecent,
      snapshotAgeDays: snapAgeDays,
      latestSnapshotArtifact: latestArtifact,
      governanceHints: govHints,
      recommendations: recs.length ? recs : ["Proceed if intentional."],
    });
  }

  let maxV: CanonGuardVerdict = "ok";
  for (const f of findings) maxV = maxVerdict(maxV, f.verdict);

  return {
    generatedAt: new Date().toISOString(),
    scope,
    findings,
    maxVerdict: maxV,
    skippedOpenOnly,
    wikiPathsScanned: toScan.length,
    gitNote,
    ignoredNoiseCount,
    ignoredHighTrustBypassCount,
    respectIgnore,
    ignoredPathsSample,
  };
}

export async function writeLastCanonGuardCache(paths: BrainPaths, report: CanonGuardReport): Promise<void> {
  const highAttentionPaths = report.findings.filter((f) => f.verdict === "high_attention").map((f) => f.path);
  const cache: LastCanonGuardCache = {
    version: 1,
    updatedAt: report.generatedAt,
    maxVerdict: report.maxVerdict,
    findingCount: report.findings.length,
    paths: report.findings.map((f) => f.path),
    highAttentionPaths,
    summaryLine:
      report.findings.length === 0
        ? "Canon guard: no high-trust wiki edits in diff scope."
        : `Canon guard: ${report.maxVerdict.toUpperCase()} — ${report.findings.length} file(s).`,
    ignoredNoiseCount: report.ignoredNoiseCount,
    respectIgnore: report.respectIgnore,
  };
  await fs.mkdir(paths.brain, { recursive: true });
  await fs.writeFile(paths.lastCanonGuardJson, JSON.stringify(cache, null, 2), "utf8");
}

export async function readLastCanonGuardCache(paths: BrainPaths): Promise<LastCanonGuardCache | null> {
  try {
    const raw = await fs.readFile(paths.lastCanonGuardJson, "utf8");
    return JSON.parse(raw) as LastCanonGuardCache;
  } catch {
    return null;
  }
}

/** Exit code for git hook: 1 when strict and high_attention */
export function canonGuardHookExitCode(report: CanonGuardReport, hookWarnOnly: boolean): number {
  if (report.maxVerdict !== "high_attention") return 0;
  return hookWarnOnly ? 0 : 1;
}

export function formatCanonGuardText(report: CanonGuardReport): string {
  const ignParts: string[] = [];
  if (!report.respectIgnore) {
    ignParts.push("ignore rules disabled (--no-respect-ignore)");
  } else {
    ignParts.push("ignore rules on (high-trust / trust Δ still always scanned)");
  }
  if (report.ignoredNoiseCount > 0) {
    ignParts.push(`${report.ignoredNoiseCount} open-noise path(s) skipped by ignore lists`);
  }
  if (report.ignoredHighTrustBypassCount > 0) {
    ignParts.push(
      `${report.ignoredHighTrustBypassCount} path(s) matched ignore but were tallied (canon/lock/trust Δ)`
    );
  }
  const lines: string[] = [
    `Canon guard — ${report.generatedAt.slice(0, 19)} (scope: ${report.scope})`,
    report.gitNote ? `Note: ${report.gitNote}` : "",
    ignParts.length ? `Filters: ${ignParts.join(" · ")}` : "",
    `Max verdict: ${report.maxVerdict.toUpperCase()} · Scanned: ${report.wikiPathsScanned} path(s) · Skipped open-only: ${report.skippedOpenOnly}`,
    "",
  ].filter(Boolean);

  if (report.ignoredPathsSample.length > 0) {
    lines.push("Ignored open paths (sample):");
    for (const p of report.ignoredPathsSample) lines.push(`  - ${p}`);
    lines.push("");
  }

  for (const f of report.findings) {
    lines.push(`── ${f.path} [${f.verdict.toUpperCase()}]`);
    for (const r of f.reasons) lines.push(`   • ${r}`);
    if (f.trustFieldChanges.length) {
      lines.push(`   Trust Δ:`);
      for (const d of f.trustFieldChanges.slice(0, 12)) lines.push(`     - ${d}`);
      if (f.trustFieldChanges.length > 12) lines.push(`     … +${f.trustFieldChanges.length - 12} more`);
    }
    lines.push(
      `   Snapshot: ${f.snapshotRecent ? "recent" : "stale/missing"}${f.snapshotAgeDays != null ? ` (~${f.snapshotAgeDays.toFixed(1)}d)` : ""}${
        f.latestSnapshotArtifact ? ` · ${f.latestSnapshotArtifact}` : ""
      }`
    );
    lines.push(`   Next:`);
    for (const x of f.recommendations) lines.push(`     → ${x}`);
    lines.push("");
  }

  if (report.findings.length === 0) {
    lines.push(
      "(No high-trust or trust-metadata changes left in scope after filters — normal open-page edits are not the target.)"
    );
  }

  return lines.join("\n");
}

/** Best-effort: detect hooks written by `brain install-hooks`. */
export async function detectCanonGuardHookInstallation(gitRoot: string): Promise<{
  preCommit: boolean;
  prePush: boolean;
}> {
  const readHook = async (name: string) => {
    try {
      return await fs.readFile(path.join(gitRoot, ".git", "hooks", name), "utf8");
    } catch {
      return "";
    }
  };
  const pc = await readHook("pre-commit");
  const pp = await readHook("pre-push");
  const hasPcMarker = pc.includes("second-brain:canon-guard-pre-commit");
  const hasPpMarker = pp.includes("second-brain:canon-guard-pre-push");
  const preCommit =
    hasPcMarker || (pc.includes("canon-guard --hook") && !pc.includes("canon-guard --hook --push"));
  const prePush = hasPpMarker || pp.includes("canon-guard --hook --push");
  return { preCommit, prePush };
}

export interface InstallCanonGuardHookOptions {
  /** Absolute brain root (SECOND_BRAIN_ROOT) */
  brainRoot: string;
  gitRoot: string;
  workspaceRoot?: string;
  brainName?: string;
}

function shEscape(s: string): string {
  return s.replace(/'/g, `'\"'\"'`);
}

function hookEnvLines(opts: InstallCanonGuardHookOptions): string[] {
  const lines: string[] = [
    `BRAIN_ROOT='${shEscape(path.resolve(opts.brainRoot))}'`,
    `GIT_ROOT='${shEscape(path.resolve(opts.gitRoot))}'`,
  ];
  if (opts.workspaceRoot) {
    lines.push(`export SECOND_BRAIN_WORKSPACE='${shEscape(path.resolve(opts.workspaceRoot))}'`);
  }
  if (opts.brainName) {
    lines.push(`export SECOND_BRAIN_NAME='${shEscape(opts.brainName)}'`);
  }
  lines.push(`export SECOND_BRAIN_ROOT="$BRAIN_ROOT"`);
  lines.push(`cd "$GIT_ROOT" || exit 0`);
  lines.push(`if ! command -v brain >/dev/null 2>&1; then`);
  lines.push(`  echo "canon-guard hook: brain CLI not in PATH — skip." >&2`);
  lines.push(`  exit 0`);
  lines.push(`fi`);
  return lines;
}

function brainCanonGuardHookCmd(opts: InstallCanonGuardHookOptions, push: boolean): string {
  if (opts.workspaceRoot) {
    return `brain --workspace "$SECOND_BRAIN_WORKSPACE" --brain "${opts.brainName ?? "master"}" canon-guard --hook${push ? " --push" : ""} || exit $?`;
  }
  return `brain --root "$BRAIN_ROOT" canon-guard --hook${push ? " --push" : ""} || exit $?`;
}

/**
 * Install canon-guard git hooks. Does not overwrite unrelated hooks — replaces hook file entirely for selected kinds.
 */
export async function installCanonGuardGitHooks(
  opts: InstallCanonGuardHookOptions,
  which: { preCommit?: boolean; prePush?: boolean }
): Promise<{ preCommit?: string; prePush?: string }> {
  const hooksDir = path.join(opts.gitRoot, ".git", "hooks");
  await fs.mkdir(hooksDir, { recursive: true });
  const out: { preCommit?: string; prePush?: string } = {};

  if (which.preCommit) {
    const hookPath = path.join(hooksDir, "pre-commit");
    const lines: string[] = [
      "#!/bin/sh",
      "# second-brain:canon-guard-pre-commit",
      "# Local reminder: canon/locked/trust edits (not ordinary open-page churn).",
      ...hookEnvLines(opts),
      brainCanonGuardHookCmd(opts, false),
      "",
    ];
    await fs.writeFile(hookPath, lines.join("\n"), "utf8");
    await fs.chmod(hookPath, 0o755);
    out.preCommit = hookPath;
  }

  if (which.prePush) {
    const hookPath = path.join(hooksDir, "pre-push");
    const lines: string[] = [
      "#!/bin/sh",
      "# second-brain:canon-guard-pre-push",
      "# Final trust pass before sharing: staged wiki changes only.",
      `echo "" >&2`,
      `echo "second-brain pre-push: running canon-guard (staged only). Open pages are not the main signal." >&2`,
      `echo "See canonGuardPrePushWarnOnly + enablePrePushCanonGuard in .brain/governance-settings.json." >&2`,
      ...hookEnvLines(opts),
      brainCanonGuardHookCmd(opts, true),
      "",
    ];
    await fs.writeFile(hookPath, lines.join("\n"), "utf8");
    await fs.chmod(hookPath, 0o755);
    out.prePush = hookPath;
  }

  return out;
}

/** Write pre-commit hook only (backward compatible). */
export async function installCanonGuardGitHook(opts: InstallCanonGuardHookOptions): Promise<string> {
  const r = await installCanonGuardGitHooks(opts, { preCommit: true });
  if (!r.preCommit) throw new Error("pre-commit hook path missing");
  return r.preCommit;
}

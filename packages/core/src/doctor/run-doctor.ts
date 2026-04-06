import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { readState } from "../state.js";
import { readReviewState } from "../review/git-approve.js";
import { getWikiStatusFilesForBrain } from "../git/service.js";
import { loadSearchIndex } from "../search/indexer.js";
import {
  persistDoctorMarkdownAndCache,
  type DoctorSavedArtifacts,
} from "./cache.js";
import { readGovernanceSettings } from "../governance/governance-settings.js";
import { detectCanonGuardHookInstallation, readLastCanonGuardCache } from "../trust/canon-guard.js";

export type DoctorCheckStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  id: string;
  status: DoctorCheckStatus;
  message: string;
}

export interface DoctorSection {
  title: string;
  checks: DoctorCheck[];
}

export type DoctorSummary = "ready" | "warnings" | "blocked";

export interface DoctorReport {
  generatedAt: string;
  vaultRoot: string;
  sections: DoctorSection[];
  summary: DoctorSummary;
  summaryLine: string;
  nextActions: string[];
}

const STALE_DAYS = 7;

function add(
  sections: DoctorSection[],
  title: string,
  id: string,
  status: DoctorCheckStatus,
  message: string
): void {
  let sec = sections.find((s) => s.title === title);
  if (!sec) {
    sec = { title, checks: [] };
    sections.push(sec);
  }
  sec.checks.push({ id, status, message });
}

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (86400 * 1000);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function gitOnPath(): Promise<boolean> {
  try {
    await execFileAsync("git", ["--version"], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function computeSummary(sections: DoctorSection[]): {
  summary: DoctorSummary;
  summaryLine: string;
} {
  let fails = 0;
  let warns = 0;
  for (const s of sections) {
    for (const c of s.checks) {
      if (c.status === "fail") fails++;
      else if (c.status === "warn") warns++;
    }
  }
  if (fails > 0) {
    return {
      summary: "blocked",
      summaryLine: "Needs setup fixes — resolve FAIL items before relying on this vault.",
    };
  }
  if (warns > 0) {
    return {
      summary: "warnings",
      summaryLine: "Usable with warnings — review WARN items before your weekly cycle.",
    };
  }
  return {
    summary: "ready",
    summaryLine: "Ready for normal use.",
  };
}

export function formatDoctorText(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(`Brain doctor — ${report.generatedAt}`);
  lines.push(`Vault: ${report.vaultRoot || "(unknown)"}`);
  lines.push("");
  lines.push(`Summary: ${report.summaryLine}`);
  lines.push("");
  for (const sec of report.sections) {
    lines.push(`── ${sec.title} ──`);
    for (const c of sec.checks) {
      const tag = c.status.toUpperCase();
      lines.push(`  [${tag}] ${c.id}`);
      lines.push(`      ${c.message}`);
    }
    lines.push("");
  }
  lines.push("── Next actions ──");
  for (const a of report.nextActions) {
    lines.push(`  • ${a}`);
  }
  lines.push("");
  lines.push(
    report.summary === "ready"
      ? "Verdict: ready for normal use"
      : report.summary === "warnings"
        ? "Verdict: usable with warnings"
        : "Verdict: needs setup fixes"
  );
  return lines.join("\n");
}

export function formatDoctorMarkdown(report: DoctorReport): string {
  const lines = [
    `---`,
    `title: Brain doctor report`,
    `generated: ${report.generatedAt}`,
    `summary: ${report.summary}`,
    `---`,
    ``,
    `# Brain doctor`,
    ``,
    `**${report.summaryLine}**`,
    ``,
  ];
  for (const sec of report.sections) {
    lines.push(`## ${sec.title}`, ``);
    for (const c of sec.checks) {
      const tag = c.status.toUpperCase();
      lines.push(`- **${tag}** \`${c.id}\` — ${c.message}`);
    }
    lines.push(``);
  }
  lines.push(`## Next actions`, ``);
  for (const a of report.nextActions) {
    lines.push(`1. ${a}`);
  }
  return lines.join("\n");
}

export interface RunDoctorOptions {
  /** If false, skip writing outputs/reports/doctor-*.md and .brain/last-doctor.json */
  saveReport?: boolean;
  /** Populated when saveReport is true and config resolved (for CLI messaging) */
  savedArtifacts?: DoctorSavedArtifacts;
}

/**
 * Run deterministic local checks (no network). Pass `null` config if resolution failed.
 */
export async function runDoctor(
  cfg: BrainConfig | null,
  resolveError: string | undefined,
  options: RunDoctorOptions = {}
): Promise<DoctorReport> {
  const generatedAt = new Date().toISOString();
  const sections: DoctorSection[] = [];
  const nextActions: string[] = [];

  if (!cfg) {
    add(
      sections,
      "A. Vault / config",
      "root",
      "fail",
      resolveError ?? "Brain config could not be resolved."
    );
    nextActions.push("Set SECOND_BRAIN_ROOT or use: brain -r /path/to/vault doctor");
    const { summary, summaryLine } = computeSummary(sections);
    return {
      generatedAt,
      vaultRoot: "",
      sections,
      summary,
      summaryLine,
      nextActions,
    };
  }

  const paths = brainPaths(cfg.root);
  const vaultRoot = cfg.root;

  add(sections, "A. Vault / config", "root_set", "pass", `Brain root: ${vaultRoot}`);

  if (!(await pathExists(cfg.root))) {
    add(sections, "A. Vault / config", "root_exists", "fail", "Vault path does not exist.");
    nextActions.push("Fix SECOND_BRAIN_ROOT or recreate the vault with brain init.");
  } else {
    add(sections, "A. Vault / config", "root_exists", "pass", "Vault path exists.");
  }

  const expectedDirs = ["raw", "wiki", "outputs", "videos", ".brain"];
  for (const d of expectedDirs) {
    const p = path.join(cfg.root, d);
    const ok = await pathExists(p);
    add(
      sections,
      "A. Vault / config",
      `dir_${d}`,
      ok ? "pass" : "fail",
      ok ? `\`${d}/\` present.` : `Missing folder: \`${d}/\` — run brain init or restore structure.`
    );
    if (!ok) nextActions.push(`Create or restore missing folder: ${cfg.root}/${d}/`);
  }

  const coreFiles: [string, string][] = [
    [paths.claudeMd, "CLAUDE.md"],
    [paths.readme, "README.md"],
    [paths.logMd, "log.md"],
  ];
  for (const [p, label] of coreFiles) {
    const ok = await pathExists(p);
    add(
      sections,
      "A. Vault / config",
      `file_${label}`,
      ok ? "pass" : "warn",
      ok ? `\`${label}\` present.` : `Missing \`${label}\` — optional for operation but recommended.`
    );
  }

  for (const rel of ["wiki/INDEX.md", "wiki/dashboard.md"]) {
    const p = path.join(cfg.root, rel);
    const ok = await pathExists(p);
    add(
      sections,
      "A. Vault / config",
      rel.replace(/\//g, "_"),
      ok ? "pass" : "warn",
      ok ? `\`${rel}\` present.` : `Missing \`${rel}\` — ingest may recreate INDEX activity; dashboard page is recommended.`
    );
  }

  const gitOk = await gitOnPath();
  add(
    sections,
    "B. Git / trust boundary",
    "git_cli",
    gitOk ? "pass" : "fail",
    gitOk ? "`git` available on PATH." : "`git` not found — install git for diffs and approve."
  );
  if (!gitOk) nextActions.push("Install git and ensure it is on PATH.");

  const gitDir = path.join(cfg.gitRoot, ".git");
  const inRepo = await pathExists(gitDir);
  add(
    sections,
    "B. Git / trust boundary",
    "git_repo",
    inRepo ? "pass" : "fail",
    inRepo
      ? `Git repo at \`${cfg.gitRoot}\` (.git present).`
      : `No .git at \`${cfg.gitRoot}\` — run git init in vault or workspace root.`
  );
  if (!inRepo) nextActions.push(`Run: cd "${cfg.gitRoot}" && git init`);

  const gr = path.resolve(cfg.gitRoot);
  const br = path.resolve(cfg.root);
  const vaultUnderGit =
    inRepo && (br === gr || br.startsWith(gr + path.sep) || gr.startsWith(br + path.sep));
  add(
    sections,
    "B. Git / trust boundary",
    "vault_in_git_tree",
    vaultUnderGit ? "pass" : inRepo ? "warn" : "warn",
    vaultUnderGit
      ? "Brain root lies inside the git root (normal layout)."
      : inRepo
        ? "Brain root and git root differ — OK for multi-brain; ensure you commit from workspace root."
        : "Cannot verify vault vs git tree without a repo."
  );

  let pendingWiki: Awaited<ReturnType<typeof getWikiStatusFilesForBrain>> = [];
  try {
    pendingWiki = inRepo ? await getWikiStatusFilesForBrain(cfg) : [];
  } catch (e) {
    add(
      sections,
      "B. Git / trust boundary",
      "git_status",
      "warn",
      `Could not read git status: ${String(e)}`
    );
  }

  add(
    sections,
    "B. Git / trust boundary",
    "uncommitted_wiki",
    pendingWiki.length > 0 ? "warn" : "pass",
    pendingWiki.length > 0
      ? `${pendingWiki.length} uncommitted path(s) under wiki scope — review before commit.`
      : "No uncommitted wiki-scoped changes in working tree."
  );
  if (pendingWiki.length > 0) {
    nextActions.push("Run brain diff or open Dashboard → Diff, then brain approve when ready.");
  }

  let reviewReadable = false;
  let reviewState: Awaited<ReturnType<typeof readReviewState>> | null = null;
  try {
    reviewState = await readReviewState(paths);
    reviewReadable = true;
  } catch (e) {
    add(
      sections,
      "B. Git / trust boundary",
      "review_state_read",
      "warn",
      `Review state unreadable: ${String(e)}`
    );
  }
  if (reviewReadable && reviewState) {
    add(
      sections,
      "B. Git / trust boundary",
      "review_state_file",
      "pass",
      `Review state readable (updated ${reviewState.updatedAt.slice(0, 19)}).`
    );
    const decided = Object.entries(reviewState.files).filter(
      ([, d]) => d === "approved" || d === "rejected"
    );
    if (decided.length > 0) {
      add(
        sections,
        "B. Git / trust boundary",
        "review_decisions",
        "pass",
        `${decided.length} path(s) marked approved/rejected in UI — run brain approve to commit approved paths.`
      );
    }

    const pendingPathsSet = new Set(pendingWiki.map((f) => f.path));
    const reviewPending = [...pendingPathsSet].filter(
      (p) => !reviewState.files[p] || reviewState.files[p] === "pending"
    ).length;
    add(
      sections,
      "B. Git / trust boundary",
      "review_pending_decisions",
      reviewPending > 0 ? "warn" : "pass",
      reviewPending > 0
        ? `${reviewPending} uncommitted wiki path(s) still need approve/reject/clear in Diff before a trust commit.`
        : "No pending per-path review decisions for current wiki diffs (or no diffs)."
    );
    if (reviewPending > 0) {
      nextActions.push("Open Dashboard → Diff and mark each changed path approved or rejected.");
    }
  } else if (await pathExists(paths.reviewStateJson)) {
    add(sections, "B. Git / trust boundary", "review_state_file", "pass", "review-state.json exists.");
  } else {
    add(
      sections,
      "B. Git / trust boundary",
      "review_state_file",
      "pass",
      "No review-state.json yet (created on first Diff approval) — OK."
    );
  }

  const state = await readState(paths);
  const ingestDays = daysSince(state.lastIngestAt);
  const lintDays = daysSince(state.lastLintAt);
  const reviewDays = daysSince(state.lastReviewAt);

  add(
    sections,
    "C. Operational freshness",
    "last_ingest",
    ingestDays !== null && ingestDays <= STALE_DAYS
      ? "pass"
      : ingestDays === null
        ? "warn"
        : "warn",
    state.lastIngestAt
      ? `Last ingest: ${state.lastIngestAt.slice(0, 19)} (${ingestDays?.toFixed(1) ?? "?"}d ago).`
      : "No ingest recorded in state.json yet."
  );
  if (ingestDays === null || (ingestDays !== null && ingestDays > STALE_DAYS)) {
    nextActions.push("Run brain ingest after adding raw material.");
  }

  add(
    sections,
    "C. Operational freshness",
    "last_lint",
    lintDays !== null && lintDays <= STALE_DAYS ? "pass" : lintDays === null ? "warn" : "warn",
    state.lastLintAt
      ? `Last lint: ${state.lastLintAt.slice(0, 19)} (${lintDays?.toFixed(1) ?? "?"}d ago).`
      : "No lint recorded — run brain lint weekly."
  );

  add(
    sections,
    "C. Operational freshness",
    "last_review",
    reviewDays !== null && reviewDays <= STALE_DAYS ? "pass" : reviewDays === null ? "warn" : "warn",
    state.lastReviewAt
      ? `Last executive review: ${state.lastReviewAt.slice(0, 19)} (${reviewDays?.toFixed(1) ?? "?"}d ago).`
      : "No weekly review recorded — run brain review."
  );

  const pendingState = state.pendingWikiChanges?.length ?? 0;
  add(
    sections,
    "C. Operational freshness",
    "state_pending",
    pendingState > 0 ? "warn" : "pass",
    pendingState > 0
      ? `state.json lists ${pendingState} pending wiki path(s) — align with git diff.`
      : "No pending wiki paths listed in state (or empty)."
  );

  const graphPath = paths.graphJson;
  try {
    const raw = await fs.readFile(graphPath, "utf8");
    JSON.parse(raw);
    add(sections, "D. Search / graph / generated", "graph", "pass", "graph.json present and valid JSON.");
  } catch {
    add(
      sections,
      "D. Search / graph / generated",
      "graph",
      "warn",
      "graph.json missing or invalid — run brain ingest or brain compile."
    );
    nextActions.push("Run brain compile to rebuild graph.json.");
  }

  const idx = await loadSearchIndex(paths);
  add(
    sections,
    "D. Search / graph / generated",
    "search_index",
    idx ? "pass" : "warn",
    idx
      ? `search index present (${idx.docs?.length ?? 0} docs).`
      : "search-index.json missing — run brain ingest or brain compile."
  );
  if (!idx) nextActions.push("Run brain compile or ingest to build search index.");

  add(
    sections,
    "D. Search / graph / generated",
    "state_json",
    (await pathExists(paths.stateJson)) ? "pass" : "warn",
    (await pathExists(paths.stateJson))
      ? "state.json present."
      : "state.json missing — will be created on first ingest/compile."
  );

  const hashesOk = await pathExists(paths.fileHashesJson);
  add(
    sections,
    "D. Search / graph / generated",
    "file_hashes",
    hashesOk ? "pass" : "warn",
    hashesOk
      ? "file-hashes.json present."
      : "file-hashes.json not yet created — normal before first ingest."
  );

  const openai = !!cfg.openaiApiKey?.trim();
  add(
    sections,
    "E. LLM / env readiness",
    "llm_openai",
    openai ? "pass" : "warn",
    openai
      ? "OPENAI_API_KEY set — LLM-backed ingest, ask, lint pass, outputs, review."
      : "OPENAI_API_KEY not set — core CLI/dashboard still work; ingest uses heuristics; ask/review/limitations apply."
  );

  add(
    sections,
    "E. LLM / env readiness",
    "llm_model",
    "pass",
    `Model: ${cfg.openaiModel ?? "default"} (optional tuning).`
  );

  const heygen = !!cfg.heygenApiKey?.trim();
  add(
    sections,
    "E. LLM / env readiness",
    "heygen_key",
    "pass",
    heygen
      ? "HEYGEN_API_KEY set — video render attempted (API may still fail)."
      : "HEYGEN_API_KEY not set — optional; brain video still writes scripts."
  );

  const heyBase = process.env.HEYGEN_API_BASE?.trim();
  if (heygen) {
    add(
      sections,
      "F. Video readiness",
      "heygen_config",
      heyBase
        ? "pass"
        : "pass",
      heyBase
        ? `HEYGEN_API_BASE=${heyBase}`
        : "Using default HEYGEN_API_BASE (https://api.heygen.com/v2)."
    );
  } else {
    add(
      sections,
      "F. Video readiness",
      "heygen_config",
      "pass",
      "HeyGen not configured — script-only video workflow."
    );
  }

  const source = cfg.vaultNameSource;
  const obsFallback = source === "default";
  add(
    sections,
    "G. Obsidian readiness",
    "vault_name",
    "pass",
    `Obsidian vault name for links: "${cfg.vaultName}" (source: ${source}).`
  );
  add(
    sections,
    "G. Obsidian readiness",
    "obsidian_links",
    obsFallback ? "warn" : "pass",
    obsFallback
      ? 'Using built-in fallback name — set SECOND_BRAIN_VAULT_NAME to match your Obsidian vault exactly.'
      : "Vault name should match Obsidian; set SECOND_BRAIN_VAULT_NAME if links open the wrong vault."
  );
  if (obsFallback || source === "basename") {
    nextActions.push(
      "Set SECOND_BRAIN_VAULT_NAME in shell or vault .env to your Obsidian vault name (Settings → About → Vault name)."
    );
  }

  try {
    const gov = await readGovernanceSettings(paths);
    if (!gov.canonGuardEnabled) {
      add(
        sections,
        "H. Canon guard (off-dashboard trust)",
        "canon_guard_enabled",
        "pass",
        "Canon guard summary in doctor is disabled (canonGuardEnabled: false). CLI `brain canon-guard` still runs."
      );
    } else {
      const cgCache = await readLastCanonGuardCache(paths);
      if (!cgCache) {
        add(
          sections,
          "H. Canon guard (off-dashboard trust)",
          "canon_guard_cache",
          "warn",
          "No `.brain/last-canon-guard.json` yet — run `brain canon-guard` after editing locked or canonical wiki paths outside the dashboard."
        );
        nextActions.push("Before committing high-trust edits from Obsidian or an editor, run: brain canon-guard");
      } else {
        const v = cgCache.maxVerdict;
        const st: DoctorCheckStatus =
          v === "high_attention" ? "warn" : v === "warn" ? "warn" : "pass";
        const hi =
          cgCache.highAttentionPaths.length > 0
            ? ` High-attention paths: ${cgCache.highAttentionPaths.slice(0, 5).join(", ")}${
                cgCache.highAttentionPaths.length > 5 ? "…" : ""
              }.`
            : "";
        add(
          sections,
          "H. Canon guard (off-dashboard trust)",
          "canon_guard_last",
          st,
          `${cgCache.summaryLine} (last run ${cgCache.updatedAt.slice(0, 19).replace("T", " ")}).${hi}`
        );
        if (v !== "ok") {
          nextActions.push(
            "Re-run `brain canon-guard`, add snapshots or a governance trail if needed; see Dashboard → Canon council / Canon admission."
          );
        }
      }
    }

    let hooks = { preCommit: false, prePush: false };
    try {
      hooks = await detectCanonGuardHookInstallation(cfg.gitRoot);
    } catch {
      /* */
    }
    const igRules =
      (gov.canonGuardIgnorePrefixes?.length ?? 0) + (gov.canonGuardIgnorePaths?.length ?? 0);
    add(
      sections,
      "H. Canon guard (off-dashboard trust)",
      "canon_guard_hooks",
      hooks.preCommit || hooks.prePush ? "pass" : "warn",
      hooks.preCommit || hooks.prePush
        ? `Git hooks: pre-commit ${hooks.preCommit ? "on" : "off"}, pre-push ${hooks.prePush ? "on" : "off"}. Run \`brain install-hooks\` to add or update.`
        : "No canon-guard git hooks detected — optional; use `brain install-hooks` (pre-commit and/or pre-push)."
    );
    add(
      sections,
      "H. Canon guard (off-dashboard trust)",
      "canon_guard_ignore_lists",
      "pass",
      igRules > 0
        ? `${igRules} ignore rule entry/entries — noisy open paths only; high-trust pages still scanned.`
        : "No canonGuardIgnorePrefixes / IgnorePaths — all changed wiki paths are candidates (before open-page skip)."
    );
    const strict: DoctorCheckStatus =
      !gov.canonGuardHookWarnOnly || !gov.canonGuardPrePushWarnOnly ? "warn" : "pass";
    const strictMsg =
      !gov.canonGuardHookWarnOnly || !gov.canonGuardPrePushWarnOnly
        ? `Strict hook mode: pre-commit ${gov.canonGuardHookWarnOnly ? "warn-only" : "blocks HIGH ATTENTION"} · pre-push ${gov.canonGuardPrePushWarnOnly ? "warn-only" : "blocks HIGH ATTENTION"}.`
        : "Hooks are warn-only for HIGH ATTENTION (default) — set canonGuardHookWarnOnly / canonGuardPrePushWarnOnly to false to block.";
    add(sections, "H. Canon guard (off-dashboard trust)", "canon_guard_strict_hooks", strict, strictMsg);
  } catch (e) {
    add(
      sections,
      "H. Canon guard (off-dashboard trust)",
      "canon_guard_read",
      "warn",
      `Could not read canon-guard cache or governance settings: ${String(e)}`
    );
  }

  const { summary, summaryLine } = computeSummary(sections);

  if (summary === "ready" && nextActions.length === 0) {
    nextActions.push("Optional: run brain doctor before weekly cycle if anything feels off.");
  } else if (summary === "ready") {
    nextActions.push("You can proceed with your normal weekly ingest → diff → approve → review → lint.");
  }

  const report: DoctorReport = {
    generatedAt,
    vaultRoot,
    sections,
    summary,
    summaryLine,
    nextActions: [...new Set(nextActions)],
  };

  if (options.saveReport !== false && cfg) {
    const sink: DoctorSavedArtifacts = options.savedArtifacts ?? {
      cacheUpdated: false,
    };
    await persistDoctorMarkdownAndCache(
      paths,
      cfg,
      report,
      formatDoctorMarkdown(report),
      pendingWiki.length,
      sink
    );
  }

  return report;
}

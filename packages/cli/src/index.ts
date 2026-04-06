#!/usr/bin/env node
import { Command } from "commander";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  applyEnvToConfig,
  resolveBrainConfig,
  scaffoldBrain,
  runIngest,
  runCompile,
  runLint,
  runAsk,
  runExecutiveReview,
  runStructuredOutput,
  runDailyVideo,
  buildKnowledgeGraph,
  getWikiDiffForBrain,
  getWikiStatusFilesForBrain,
  applyReviewDecisions,
  commitAllWikiForBrain,
  brainPaths,
  initWorkspace,
  createMasterBrain,
  createAgentBrain,
  writeActiveBrain,
  listBrainsWorkspace,
  getWorkspaceStatus,
  promoteBetweenBrains,
  promoteReviewMarkdown,
  syncCrossBrainSummary,
  writeSyncSummaryFile,
  addPromotionCandidate,
  addInboxItem,
  searchAcrossBrains,
  readActiveBrain,
  suggestWikiCommitMessage,
  runDoctor,
  formatDoctorText,
  type DoctorSavedArtifacts,
  listRuns,
  getRunById,
  runComparativeSynthesis,
  refreshOperationalIntelligence,
  readUnsupportedClaims,
  generateReviewPacket,
  recordPageSnapshot,
  readResolutions,
  readCrossSignal,
  readCanonicalBoard,
  generateStewardDigestForDomain,
  generateAllStewardDigests,
  generateQuarterlyOperationalReview,
  rebuildReviewSessionQueue,
  readReviewSessionState,
  buildDecisionDraftPreview,
  writeDecisionDraftFromPreview,
  readCanonCouncil,
  generateQuarterOverQuarterDiff,
  readReviewDebt,
  readDecisionSunset,
  generateAnnualReflectiveReview,
  buildReviewWorkloadPlans,
  writeReviewWorkloadMarkdown,
  readHumanOverrides,
  runCanonGuard,
  formatCanonGuardText,
  writeLastCanonGuardCache,
  canonGuardHookExitCode,
  installCanonGuardGitHooks,
  readGovernanceSettings,
  patchGovernanceSettings,
} from "@second-brain/core";
import type { OutputKind, BrainTemplateId, CanonGuardDiffScope } from "@second-brain/core";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, "..", "..", "..");

const TEMPLATES: BrainTemplateId[] = [
  "master",
  "coding-agent",
  "strategy-agent",
  "research-agent",
  "leadership-agent",
];

const program = new Command();

program
  .name("brain")
  .description("Second Brain AI — local LLM wiki CLI (single- or multi-brain)");

program
  .option("-r, --root <path>", "Brain root (legacy single-brain mode)")
  .option("-w, --workspace <path>", "Workspace root (multi-brain; or SECOND_BRAIN_WORKSPACE)")
  .option("-b, --brain <name>", "Brain name in workspace (or SECOND_BRAIN_NAME)");

type GlobalOpts = { root?: string; workspace?: string; brain?: string };

function opts(): GlobalOpts {
  return program.opts() as GlobalOpts;
}

function workspacePath(): string {
  const w = opts().workspace ?? process.env.SECOND_BRAIN_WORKSPACE;
  if (!w) {
    throw new Error("Set --workspace or SECOND_BRAIN_WORKSPACE for this command.");
  }
  return path.resolve(w);
}

async function getCfg() {
  const o = opts();
  dotenv.config();
  const cfgPre = await resolveBrainConfig({
    explicitBrainRoot: o.root,
    workspaceRoot: o.workspace ?? process.env.SECOND_BRAIN_WORKSPACE,
    brainName: o.brain ?? process.env.SECOND_BRAIN_NAME,
  });
  dotenv.config({ path: path.join(cfgPre.root, ".env") });
  return applyEnvToConfig(cfgPre);
}

program
  .command("workspace")
  .description("Multi-brain workspace commands")
  .addCommand(
    new Command("init")
      .description("Create brains/, .workspace/, and workspace git repo")
      .argument("[target]", "Workspace directory", process.cwd())
      .action(async (target: string) => {
        await initWorkspace(path.resolve(target));
        console.log(`Workspace initialized at ${path.resolve(target)}`);
        console.log(`export SECOND_BRAIN_WORKSPACE=${path.resolve(target)}`);
      })
  );

program
  .command("create")
  .description("Create a brain inside the workspace")
  .argument("<kind>", "master | agent")
  .argument("[name]", "Agent name (for agent kind)")
  .option("--template <id>", "Agent template", "coding-agent")
  .action(async (kind: string, name: string | undefined, cmd: { template?: string }) => {
    const ws = workspacePath();
    if (kind === "master") {
      const p = await createMasterBrain(ws);
      console.log(`Master brain at ${p}`);
      return;
    }
    if (kind !== "agent" || !name) {
      throw new Error('Usage: brain create agent <name> --template <type>');
    }
    const t = (cmd.template ?? "coding-agent") as BrainTemplateId;
    if (!TEMPLATES.includes(t) || t === "master") {
      throw new Error(`Template must be one of: ${TEMPLATES.filter((x) => x !== "master").join(", ")}`);
    }
    const p = await createAgentBrain(ws, name, t);
    console.log(`Agent brain "${name}" at ${p}`);
  });

program
  .command("list")
  .description("List brains in workspace (requires workspace)")
  .action(async () => {
    const ws = workspacePath();
    const rows = await listBrainsWorkspace(ws);
    const active = await readActiveBrain(ws);
    for (const r of rows) {
      const tag = active?.name === r.name ? " (active)" : "";
      console.log(`${r.name}\t${r.type}\t${r.path}${tag}`);
    }
  });

program
  .command("use")
  .description("Set active brain for workspace")
  .argument("<name>", "Brain name")
  .action(async (name: string) => {
    await writeActiveBrain(workspacePath(), name);
    console.log(`Active brain: ${name}`);
  });

program
  .command("status")
  .description("Workspace + active brain + recent runs")
  .action(async () => {
    const st = await getWorkspaceStatus(workspacePath());
    console.log(`Workspace: ${st.workspaceRoot}`);
    console.log(`Active: ${st.activeBrain ?? "—"}`);
    console.log("\nBrains:");
    for (const b of st.brains) {
      console.log(`- ${b.name} (${b.type}) ${b.path}`);
    }
    console.log("\nRecent runs:");
    for (const r of st.recentRuns.slice(0, 20)) {
      console.log(`- [${r.brain}] ${r.kind}: ${r.summary} (${r.ok ? "ok" : "issue"})`);
    }
  });

program
  .command("promote")
  .description("Curated promote from source brain to target brain (e.g. master)")
  .argument("<sourceBrain>", "Source brain name")
  .argument("<targetBrain>", "Target brain name (usually master)")
  .argument("<file>", "Path relative to source brain (e.g. outputs/reports/x.md)")
  .option("--rationale <text>", "Why this is worth promoting")
  .action(
    async (
      source: string,
      target: string,
      file: string,
      o: { rationale?: string }
    ) => {
      const ws = workspacePath();
      const { destAbs } = await promoteBetweenBrains(ws, source, target, file, {
        rationale: o.rationale,
      });
      console.log(`Promoted → ${destAbs}`);
      console.log("Review in master wiki, then git commit from workspace root.");
    }
  );

program
  .command("promote-review")
  .description("Show promotion candidates for an agent brain")
  .argument("<sourceBrain>", "Agent brain name")
  .action(async (source: string) => {
    const md = await promoteReviewMarkdown(workspacePath(), source);
    console.log(md);
  });

program
  .command("sync-summary")
  .description("Cross-brain executive summary (opt-in synthesis)")
  .action(async () => {
    const ws = workspacePath();
    const md = await syncCrossBrainSummary(ws);
    const out = await writeSyncSummaryFile(ws, md);
    console.log(`Wrote ${out}`);
    console.log("\n---\n");
    console.log(md);
  });

program
  .command("candidate")
  .description("Mark a path in the current brain as a promotion candidate")
  .argument("<relPath>", "Relative to brain root")
  .option("--rationale <text>")
  .action(async (relPath: string, o: { rationale?: string }) => {
    const cfg = await getCfg();
    await addPromotionCandidate(cfg.root, {
      relPath,
      kind: relPath.startsWith("wiki/") ? "wiki" : "output",
      confidence: "medium",
      rationale: o.rationale,
    });
    const paths = brainPaths(cfg.root);
    await addInboxItem(paths, {
      sourcePath: relPath,
      candidateType: relPath.startsWith("wiki/") ? "wiki" : "output",
      rationale: o.rationale ?? "CLI candidate",
    });
    console.log(`Queued ${relPath} for promotion review + local inbox`);
  });

program
  .command("search-all")
  .description("Opt-in: search all brains in workspace (read-only merge)")
  .argument("<query>", "Query string")
  .action(async (query: string) => {
    const hits = await searchAcrossBrains(workspacePath(), query, 12);
    for (const h of hits.slice(0, 40)) {
      console.log(
        `[${h.brain}] ${h.hit.kind} ${h.hit.path} (${h.hit.score.toFixed(1)}) — ${h.hit.preview.slice(0, 120)}`
      );
    }
  });

program
  .command("operational [task]")
  .description(
    "Operational intelligence: rebuild .brain/*.json heuristics (default task: refresh)"
  )
  .action(async (task?: string) => {
    const t = task ?? "refresh";
    if (t !== "refresh") {
      console.error('Usage: brain operational [refresh]');
      process.exit(1);
    }
    const cfg = await getCfg();
    const res = await refreshOperationalIntelligence(cfg);
    console.log(
      res.ok
        ? `OK — scanned ${res.wikiPagesScanned} wiki pages`
        : `Completed with errors (${res.errors.length})`
    );
    if (res.errors.length) console.error(res.errors.join("\n"));
  });

program
  .command("unsupported")
  .description("List or inspect the unsupported-claim triage queue (.brain/unsupported-claims.json)")
  .option("--status <s>", "Filter: new | reviewing | resolved | ignored | all", "all")
  .option("--open <id>", "Print one claim as JSON")
  .action(async (o: { status?: string; open?: string }) => {
    const cfg = await getCfg();
    const paths = brainPaths(cfg.root);
    const file = await readUnsupportedClaims(paths);
    if (o.open) {
      const item = file.items.find((x) => x.id === o.open);
      if (!item) {
        console.error("No item with that id.");
        process.exit(1);
      }
      console.log(JSON.stringify(item, null, 2));
      return;
    }
    const st = o.status ?? "all";
    let items = file.items;
    if (st !== "all") {
      items = items.filter((x) => x.status === st);
    }
    for (const u of items.slice(0, 100)) {
      console.log(
        `${u.id}\t${u.status}\t${u.severity}\t${u.pagePath}\t${u.reason.slice(0, 72)}`
      );
    }
    if (items.length > 100) {
      console.error(`…and ${items.length - 100} more (narrow with --status)`);
    }
  });

program
  .command("review-packet")
  .description("Write outputs/reviews/review-packet-*.md from queues, board, dragons (run operational refresh first)")
  .action(async () => {
    const cfg = await getCfg();
    const rel = await generateReviewPacket(cfg);
    console.log(rel);
  });

program
  .command("snapshot")
  .description("Save a dated copy of a wiki page under outputs/reviews/snapshots/")
  .argument("<wikiPath>", "Repo-relative, e.g. wiki/decisions/foo.md")
  .option("-m, --reason <text>")
  .action(async (wikiPath: string, o: { reason?: string }) => {
    const cfg = await getCfg();
    const norm = wikiPath.replace(/^\/+/, "");
    if (!norm.startsWith("wiki/")) {
      console.error("Path must start with wiki/");
      process.exit(1);
    }
    const out = await recordPageSnapshot(cfg, norm, o.reason, undefined);
    console.log(`${out.id}\t${out.artifactRel}`);
  });

program
  .command("resolutions")
  .description("Inspect resolution memory (.brain/resolutions.json)")
  .option("--open <id>", "Print one JSON record")
  .action(async (o: { open?: string }) => {
    const cfg = await getCfg();
    const paths = brainPaths(cfg.root);
    const f = await readResolutions(paths);
    if (o.open) {
      const x = f.items.find((i) => i.id === o.open);
      if (!x) {
        console.error("Not found.");
        process.exit(1);
      }
      console.log(JSON.stringify(x, null, 2));
      return;
    }
    for (const r of f.items.slice(0, 80)) {
      console.log(`${r.id}\t${r.type}\t${r.resolvedAt.slice(0, 10)}\t${r.issueSummary.slice(0, 60)}`);
    }
  });

program
  .command("correlations")
  .description("Print cross-signal correlation top rows (after operational refresh)")
  .action(async () => {
    const cfg = await getCfg();
    const paths = brainPaths(cfg.root);
    const f = await readCrossSignal(paths);
    for (const x of f?.items ?? []) {
      console.log(`${x.dragonScore}\t${x.path}\t${x.signals.slice(0, 3).join("; ")}`);
    }
  });

program
  .command("canonical-board")
  .description("Print canonical review board rows (TSV)")
  .action(async () => {
    const cfg = await getCfg();
    const paths = brainPaths(cfg.root);
    const b = await readCanonicalBoard(paths);
    for (const i of b?.items ?? []) {
      console.log(
        `${i.priorityScore}\t${i.urgency}\t${i.path}\t${i.warnings.slice(0, 2).join(" | ")}`
      );
    }
  });

program
  .command("steward")
  .description("Alias: write steward digest markdown for one domain (see steward-digest)")
  .option("--domain <name>", "e.g. work, decisions, research", "work")
  .option("--all", "All active domains")
  .action(async (o: { domain?: string; all?: boolean }) => {
    const cfg = await getCfg();
    if (o.all) {
      const outs = await generateAllStewardDigests(cfg);
      for (const p of outs) console.log(p);
      return;
    }
    const out = await generateStewardDigestForDomain(cfg, o.domain ?? "work");
    console.log(out);
  });

program
  .command("decision-draft")
  .description(
    "Preview or write wiki/decisions/ stub from raw/ or outputs/ (include_in_ledger: false until you promote)"
  )
  .argument("<sourcePath>", "e.g. raw/inbox/note.md")
  .option("--write", "Write file after preview (omit to print markdown only)")
  .option("--slug <s>", "Optional slug hint for filename")
  .action(async (sourcePath: string, o: { write?: boolean; slug?: string }) => {
    const cfg = await getCfg();
    const preview = await buildDecisionDraftPreview(cfg, sourcePath, { slugHint: o.slug });
    if (!o.write) {
      console.error(`# Preview → ${preview.wikiRel}\n`);
      console.log(preview.markdown);
      return;
    }
    const rel = await writeDecisionDraftFromPreview(cfg, preview);
    console.error(`Wrote ${rel}`);
  });

program
  .command("canon-guard")
  .description(
    "Inspect git-scoped wiki diffs for canon/lock/high-trust edits without recent snapshots or governance trail"
  )
  .argument("[paths...]", "Optional repo-relative wiki paths to narrow the scan")
  .option("--json", "Print machine-readable JSON")
  .option("--no-save", "Do not write .brain/last-canon-guard.json")
  .option("--staged-only", "Only staged changes")
  .option("--unstaged-only", "Only unstaged/untracked hints")
  .option(
    "--hook",
    "Git hook mode: exit 1 on HIGH ATTENTION when warn-only is false (pre-commit: canonGuardHookWarnOnly)"
  )
  .option("--push", "With --hook only: pre-push mode (staged-only; uses enablePrePushCanonGuard + canonGuardPrePushWarnOnly)")
  .option("--no-respect-ignore", "Include paths that match canonGuardIgnorePrefixes / canonGuardIgnorePaths")
  .option("--verbose-ignored", "List ignored open-noise paths (cap 40) in output")
  .action(
    async (
      relPaths: string[],
      o: {
        json?: boolean;
        save?: boolean;
        stagedOnly?: boolean;
        unstagedOnly?: boolean;
        hook?: boolean;
        push?: boolean;
        noRespectIgnore?: boolean;
        verboseIgnored?: boolean;
      }
    ) => {
      if (o.push && !o.hook) {
        console.error("--push is only valid with --hook (used by the pre-push git hook).");
        process.exit(2);
      }
      if (o.stagedOnly && o.unstagedOnly) {
        console.error("Use only one of --staged-only and --unstaged-only.");
        process.exit(2);
      }
      let scope: CanonGuardDiffScope = "both";
      if (o.stagedOnly) scope = "staged";
      if (o.unstagedOnly) scope = "unstaged";
      if (o.hook && o.push) {
        scope = "staged";
      }

      const cfg = await getCfg();
      const paths = brainPaths(cfg.root);
      const settings = await readGovernanceSettings(paths);

      if (o.hook && o.push && !settings.enablePrePushCanonGuard) {
        console.error("canon-guard pre-push: skipped (enablePrePushCanonGuard: false).");
        process.exit(0);
      }
      if (o.hook && !o.push && !settings.canonGuardEnabled) {
        console.error("canon-guard hook: skipped (canonGuardEnabled: false).");
        process.exit(0);
      }

      const normalized = relPaths.map((p) => p.replace(/^\/+/, "")).filter(Boolean);
      const respectIgnore = !o.noRespectIgnore;
      const report = await runCanonGuard(cfg, {
        scope,
        pathsOnly: normalized.length ? normalized : undefined,
        respectIgnore,
        verboseIgnored: !!o.verboseIgnored,
      });

      const noSave = o.save === false;
      if (!noSave) {
        await writeLastCanonGuardCache(paths, report);
      }

      if (o.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatCanonGuardText(report));
        if (noSave) {
          console.error("\n--no-save: skipped .brain/last-canon-guard.json.");
        }
      }

      if (o.hook) {
        const warnOnly = o.push ? settings.canonGuardPrePushWarnOnly : settings.canonGuardHookWarnOnly;
        const label = o.push ? "pre-push" : "pre-commit";
        const code = canonGuardHookExitCode(report, warnOnly);
        if (code !== 0) {
          console.error(
            `\ncanon-guard (${label}): HIGH ATTENTION — blocked (restore warn-only in .brain/governance-settings.json).`
          );
        }
        process.exit(code);
      }
    }
  );

program
  .command("install-hooks")
  .description(
    "Install git hooks for canon-guard (default: pre-commit only; use --pre-push or --all for push-time check)"
  )
  .option("--pre-commit", "Install pre-commit hook")
  .option("--pre-push", "Install pre-push hook (staged-only scan before remote)")
  .option("--all", "Install pre-commit and pre-push")
  .action(
    async (o: { preCommit?: boolean; prePush?: boolean; all?: boolean }) => {
      const all = !!o.all;
      const pc = !!o.preCommit;
      const pp = !!o.prePush;
      const wantPreCommit = all || pc || (!pp && !pc && !all);
      const wantPrePush = all || pp;

      const cfg = await getCfg();
      const paths = brainPaths(cfg.root);

      const installed = await installCanonGuardGitHooks(
        {
          brainRoot: cfg.root,
          gitRoot: cfg.gitRoot,
          workspaceRoot: cfg.workspaceRoot,
          brainName: cfg.brainName,
        },
        { preCommit: wantPreCommit, prePush: wantPrePush }
      );

      const patch: {
        installGitHooks?: boolean;
        installPrePushHook?: boolean;
        enablePrePushCanonGuard?: boolean;
      } = {};
      if (wantPreCommit) patch.installGitHooks = true;
      if (wantPrePush) {
        patch.installPrePushHook = true;
        patch.enablePrePushCanonGuard = true;
      }
      const after = await patchGovernanceSettings(paths, patch);

      console.log("Canon-guard hooks:");
      if (installed.preCommit) {
        console.log(`  pre-commit:  ${installed.preCommit}`);
      }
      if (installed.prePush) {
        console.log(`  pre-push:    ${installed.prePush}`);
      }
      console.log("");
      console.log("Blocking vs warn-only (edit .brain/governance-settings.json):");
      console.log(
        `  pre-commit:  ${after.canonGuardHookWarnOnly ? "WARN-ONLY (exit 0 on HIGH ATTENTION)" : "STRICT (exit 1 on HIGH ATTENTION)"}`
      );
      console.log(
        `  pre-push:    ${after.canonGuardPrePushWarnOnly ? "WARN-ONLY" : "STRICT"} · enabled: ${after.enablePrePushCanonGuard}`
      );
      console.log("");
      console.log("Patched governance flags:", JSON.stringify(patch));
      console.log(
        "\nPre-push runs `brain canon-guard --hook --push` (staged only). Disable with enablePrePushCanonGuard: false."
      );
      console.log(
        "Ensure `brain` is on PATH when git runs hooks, or edit the hook scripts to use the full path to this CLI."
      );
    }
  );

program
  .command("doctor")
  .description("Health and environment diagnostic for the active vault")
  .option("--json", "Print machine-readable JSON")
  .option("--no-save", "Do not write outputs/reports/doctor-*.md or .brain/last-doctor.json")
  .action(async (o: { json?: boolean; save?: boolean }) => {
    let err: string | undefined;
    let cfg: Awaited<ReturnType<typeof resolveBrainConfig>> | null = null;
    try {
      cfg = await getCfg();
    } catch (e) {
      err = (e as Error).message ?? String(e);
    }
    const noSave = o.save === false;
    const saved: DoctorSavedArtifacts = { cacheUpdated: false };
    const report = await runDoctor(cfg, err, {
      saveReport: !noSave,
      savedArtifacts: saved,
    });
    if (o.json) {
      console.log(JSON.stringify(report, null, 2));
      if (noSave) {
        console.error("brain doctor: --no-save — no report or last-doctor.json written.");
      }
    } else {
      console.log(formatDoctorText(report));
      if (noSave) {
        console.error("\n--no-save: skipped markdown report and .brain/last-doctor.json.");
      } else if (cfg) {
        if (saved.markdownPath) {
          console.error(`\nReport: ${saved.markdownPath}`);
        }
        if (saved.lastDoctorJsonPath) {
          console.error(
            `Cache:  ${saved.lastDoctorJsonPath} (${saved.cacheUpdated ? "updated" : "not updated"})`
          );
        }
      }
    }
  });

program
  .command("init")
  .description("Legacy: scaffold a single brain folder")
  .option("--target <path>", "Directory (default: ./second-brain)")
  .action(async (cmdOpts: { target?: string }) => {
    const target = path.resolve(
      cmdOpts.target ?? path.join(process.cwd(), "second-brain")
    );
    await scaffoldBrain(target);
    console.log(`\nInitialized vault at ${target}`);
    console.log(`export SECOND_BRAIN_ROOT=${target}\n`);
    console.log("First-run checklist:");
    console.log("  1. Export SECOND_BRAIN_ROOT (see above) or pass -r on every command.");
    console.log("  2. Edit CLAUDE.md to match how you work.");
    console.log("  3. Add notes to raw/inbox/ (see raw/inbox/getting-started.md).");
    console.log("  4. Run: brain ingest");
    console.log("  5. Run: brain diff — review every wiki path");
    console.log("  6. Approve in dashboard Diff UI, then: brain approve");
    console.log("  7. Run: brain dashboard — open the URL shown");
    console.log("  8. Weekly: ingest → review → lint → approve → optional video");
    console.log("  9. If setup feels wrong: brain doctor");
    console.log(`\nMore detail: ${path.join(target, "README.md")}\n`);
  });

program
  .command("ingest")
  .option("--force", "Reprocess unchanged")
  .action(async (o: { force?: boolean }) => {
    const cfg = await getCfg();
    const res = await runIngest(cfg, { force: !!o.force });
    console.log(`Processed ${res.processed}, skipped ${res.skipped}`);
    if (res.errors.length) console.error(res.errors.join("\n"));
  });

program
  .command("compile").action(async () => {
  const cfg = await getCfg();
  const res = await runCompile(cfg);
  console.log(`Compile complete — ${res.wikiPages} wiki pages indexed.`);
});

program
  .command("ask")
  .argument("<question>")
  .option("--promote")
  .action(async (q: string, o: { promote?: boolean }) => {
    const cfg = await getCfg();
    const { answerPath } = await runAsk(cfg, q, { promote: !!o.promote });
    console.log(`Answer written to ${answerPath}`);
  });

program
  .command("review").action(async () => {
  const cfg = await getCfg();
  const file = await runExecutiveReview(cfg);
  console.log(`Review written to ${file}`);
});

program
  .command("lint").action(async () => {
  const cfg = await getCfg();
  const rep = await runLint(cfg);
  console.log(`Findings: ${rep.findings.length}`);
  for (const f of rep.findings.slice(0, 40)) {
    console.log(`- [${f.severity}] ${f.code}: ${f.message}`);
  }
});

program
  .command("video").action(async () => {
  const cfg = await getCfg();
  const res = await runDailyVideo(cfg);
  console.log(`Script: ${res.scriptPath}`);
  if (res.videoUrl) console.log(`Video: ${res.videoUrl}`);
  if (res.videoError) console.error(`HeyGen: ${res.videoError} (script still saved)`);
});

program
  .command("graph").action(async () => {
  const cfg = await getCfg();
  await buildKnowledgeGraph(cfg);
  console.log("graph.json updated");
});

program
  .command("diff").action(async () => {
  const cfg = await getCfg();
  const diff = await getWikiDiffForBrain(cfg);
  console.log(diff || "(no diff)");
  const files = await getWikiStatusFilesForBrain(cfg);
  console.log("\nChanged wiki files (repo paths):");
  for (const f of files) console.log(`- ${f.path} (${f.workingDir})`);
});

program
  .command("approve")
  .option("--all")
  .option("-m, --message <text>")
  .action(async (o: { all?: boolean; message?: string }) => {
    const cfg = await getCfg();
    const paths = brainPaths(cfg.root);
    if (o.all) {
      let msg = o.message;
      if (!msg) {
        try {
          msg = await suggestWikiCommitMessage(paths);
        } catch (e) {
          console.error(e);
          msg = "Update wiki content";
        }
      }
      await commitAllWikiForBrain(cfg, paths, msg);
      console.log("Committed wiki for active brain");
      return;
    }
    const res = await applyReviewDecisions(cfg, paths);
    console.log(res.message);
  });

program
  .command("output")
  .argument("<kind>")
  .argument("<topic>")
  .action(async (kind: string, topic: string) => {
    const cfg = await getCfg();
    const file = await runStructuredOutput(cfg, kind as OutputKind, topic);
    console.log(`Output written to ${file}`);
  });

program
  .command("dashboard").action(async () => {
  const cfg = await getCfg();
  const port = String(cfg.dashboardPort ?? 3847);
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: port, SECOND_BRAIN_NAME: cfg.brainName };
  if (cfg.workspaceRoot) {
    env.SECOND_BRAIN_WORKSPACE = cfg.workspaceRoot;
    delete env.SECOND_BRAIN_ROOT;
  } else {
    env.SECOND_BRAIN_ROOT = cfg.root;
    delete env.SECOND_BRAIN_WORKSPACE;
  }
  const child = spawn("npm", ["run", "dev", "--", "-p", port], {
    cwd: path.join(monorepoRoot, "apps", "dashboard"),
    stdio: "inherit",
    env,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
});

program
  .command("runs")
  .description("List recent operation runs (.brain/runs)")
  .option("-n, --limit <n>", "Max entries", "25")
  .action(async (o: { limit?: string }) => {
    const cfg = await getCfg();
    const paths = brainPaths(cfg.root);
    const lim = Math.max(1, parseInt(String(o.limit ?? "25"), 10) || 25);
    const runs = await listRuns(paths, lim);
    for (const r of runs) {
      console.log(
        `${r.id}\t${r.startedAt.slice(0, 19)}\t${r.kind}\t${r.ok ? "ok" : "issue"}\t${r.summary}`
      );
    }
  });

program
  .command("run")
  .description("Show a single run record (replay JSON)")
  .argument("<id>", "Run id (UUID in run file)")
  .action(async (id: string) => {
    const cfg = await getCfg();
    const paths = brainPaths(cfg.root);
    const rec = await getRunById(paths, id);
    if (!rec) {
      console.error("Run not found.");
      process.exit(1);
    }
    console.log(JSON.stringify(rec, null, 2));
  });

program
  .command("governance-refresh")
  .description("Refresh operational intelligence + governance JSON (same chain as after brain lint)")
  .action(async () => {
    const cfg = await getCfg();
    const r = await refreshOperationalIntelligence(cfg, {});
    console.log(JSON.stringify(r, null, 2));
  });

program
  .command("steward-digest")
  .description("Write domain steward digest markdown under outputs/reviews/")
  .option("--domain <name>", "Domain folder (e.g. work, research)")
  .option("--all", "All domains with activity")
  .action(async (o: { domain?: string; all?: boolean }) => {
    const cfg = await getCfg();
    if (o.all) {
      const outs = await generateAllStewardDigests(cfg);
      for (const p of outs) console.log(p);
      return;
    }
    const d = o.domain ?? "work";
    const out = await generateStewardDigestForDomain(cfg, d);
    console.log(out);
  });

program
  .command("quarterly-review")
  .description("Write reflective quarterly operational review markdown")
  .action(async () => {
    const cfg = await getCfg();
    const out = await generateQuarterlyOperationalReview(cfg);
    console.log(out);
  });

program
  .command("canon-council")
  .description("Print canon council rows (TSV) from .brain/canon-council.json after refresh")
  .action(async () => {
    const cfg = await getCfg();
    const paths = brainPaths(cfg.root);
    const c = await readCanonCouncil(paths);
    if (!c?.items?.length) {
      console.error("No canon-council.json or empty — run brain lint or brain operational refresh.");
      process.exit(1);
    }
    for (const i of c.items.slice(0, 60)) {
      console.log(`${i.priorityScore}\t${i.kind}\t${i.path}\t${i.recommendedNext.slice(0, 72)}`);
    }
    console.error(`\n${c.headline}`);
  });

program
  .command("qoq-diff")
  .description("Compare two quarterly review markdown files (repo-relative)")
  .requiredOption("--from <path>", "e.g. outputs/reviews/quarterly-review-Q1-2026-....md")
  .requiredOption("--to <path>", "newer quarterly review path")
  .action(async (o: { from: string; to: string }) => {
    const cfg = await getCfg();
    const out = await generateQuarterOverQuarterDiff(cfg, o.from.replace(/^\/+/, ""), o.to.replace(/^\/+/, ""));
    console.log(out);
  });

program
  .command("review-debt")
  .description("Print review debt summary (.brain/review-debt.json)")
  .action(async () => {
    const cfg = await getCfg();
    const paths = brainPaths(cfg.root);
    const d = await readReviewDebt(paths);
    if (!d) {
      console.error("No review-debt.json — run operational refresh.");
      process.exit(1);
    }
    console.log(`Level: ${d.level}\tScore: ${d.score0to100}\tTrend: ${d.trendHint}`);
    for (const c of d.contributors) {
      console.log(`${c.label}\t${c.count}\t${c.note.slice(0, 60)}`);
    }
  });

program
  .command("decision-sunset")
  .description("List decision sunset hints (TSV)")
  .action(async () => {
    const cfg = await getCfg();
    const paths = brainPaths(cfg.root);
    const f = await readDecisionSunset(paths);
    for (const h of f?.hints ?? []) {
      console.log(
        `${h.id}\t${h.status}\t${h.decisionWikiPath}\t${(h.whyFlagged[0] ?? "").slice(0, 72)}`
      );
    }
  });

program
  .command("annual-review")
  .description("Write reflective annual review markdown under outputs/reviews/")
  .action(async () => {
    const cfg = await getCfg();
    const out = await generateAnnualReflectiveReview(cfg);
    console.log(out);
  });

program
  .command("review-plan")
  .description("Print or save 10/30/60 minute review workload plan")
  .option("--minutes <n>", "10 | 30 | 60", "10")
  .option("--write", "Save markdown under outputs/reviews/")
  .action(async (o: { minutes?: string; write?: boolean }) => {
    const cfg = await getCfg();
    const { plans } = await buildReviewWorkloadPlans(cfg);
    const n = String(o.minutes ?? "10");
    const label = n === "60" ? "60min" : n === "30" ? "30min" : "10min";
    const plan = plans.find((p) => p.label === label) ?? plans[0];
    if (!plan) {
      console.error("No plan.");
      process.exit(1);
    }
    console.log(JSON.stringify(plan, null, 2));
    if (o.write) {
      const p = await writeReviewWorkloadMarkdown(cfg, plan);
      console.error(`Wrote ${p}`);
    }
  });

program
  .command("overrides")
  .description("List human override journal (.brain/human-overrides.json)")
  .option("--limit <n>", "Max rows", "40")
  .action(async (o: { limit?: string }) => {
    const cfg = await getCfg();
    const paths = brainPaths(cfg.root);
    const lim = Math.max(1, parseInt(String(o.limit ?? "40"), 10) || 40);
    const f = await readHumanOverrides(paths);
    for (const x of f.items.slice(0, lim)) {
      console.log(`${x.createdAt.slice(0, 10)}\t${x.overrideType}\t${x.relatedPath}\t${x.rationale.slice(0, 60)}`);
    }
  });

program
  .command("review-session")
  .description("Print or rebuild review session queue (.brain/review-session-state.json)")
  .option("--rebuild", "Rebuild queue from SLA + canon data")
  .action(async (o: { rebuild?: boolean }) => {
    const cfg = await getCfg();
    const paths = brainPaths(cfg.root);
    if (o.rebuild) {
      const s = await rebuildReviewSessionQueue(cfg);
      console.log(`Rebuilt queue: ${s.queue.length} items`);
    }
    const s = await readReviewSessionState(paths);
    console.log(JSON.stringify(s, null, 2));
  });

program
  .command("compare")
  .description("Comparative synthesis for 2–4 wiki paths (repo-relative)")
  .argument("<paths...>")
  .option("--inbox", "Queue result in local promotion inbox")
  .action(async (relPaths: string[], o: { inbox?: boolean }) => {
    const cfg = await getCfg();
    const normalized = relPaths.map((p) => p.replace(/^\/+/, ""));
    const res = await runComparativeSynthesis(cfg, normalized, {
      addToPromotionInbox: !!o.inbox,
    });
    console.log(`Wrote ${res.outputRelPath} (lineage ${res.lineageId})`);
  });

program
  .command("mcp").action(async () => {
  const cfg = await getCfg();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SECOND_BRAIN_NAME: cfg.brainName,
    BRAIN_CONTEXT_JSON: JSON.stringify({
      brain: cfg.brainName,
      workspaceRoot: cfg.workspaceRoot ?? null,
    }),
  };
  if (cfg.workspaceRoot) {
    env.SECOND_BRAIN_WORKSPACE = cfg.workspaceRoot;
    delete env.SECOND_BRAIN_ROOT;
  } else {
    env.SECOND_BRAIN_ROOT = cfg.root;
    delete env.SECOND_BRAIN_WORKSPACE;
  }
  const proc = spawn(process.execPath, [path.join(monorepoRoot, "packages", "mcp", "dist", "index.js")], {
    stdio: "inherit",
    env,
  });
  proc.on("exit", (code) => process.exit(code ?? 0));
});

program.parseAsync().catch((e) => {
  console.error(e);
  process.exit(1);
});

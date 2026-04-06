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
  searchAcrossBrains,
  readActiveBrain,
  suggestWikiCommitMessage,
  runDoctor,
  formatDoctorText,
  type DoctorSavedArtifacts,
} from "@second-brain/core";
import type { OutputKind, BrainTemplateId } from "@second-brain/core";

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
    console.log(`Queued ${relPath} for promotion review`);
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

import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { readDecisionLedger } from "../trust/decision-ledger.js";
import { readConflicts } from "../trust/conflicts.js";
import { readKnowledgeDrift } from "../trust/knowledge-drift.js";
import { readEvidenceChangeAlerts } from "./evidence-change.js";
import { computeDomainCoverage } from "../trust/coverage-gaps.js";
import { buildDomainScorecards } from "../trust/domain-scorecards.js";
import { readOpenLoops } from "../trust/open-loops.js";
import { readExecutiveSnapshot } from "../trust/executive-snapshot.js";
import { listRuns } from "../runs.js";

function quarterLabel(d: Date): string {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q}-${d.getFullYear()}`;
}

/**
 * Reflective quarterly report from local signals — optional LLM could be layered later.
 */
export async function generateQuarterlyOperationalReview(cfg: BrainConfig): Promise<string> {
  const paths = brainPaths(cfg.root);
  const now = new Date();
  const stamp = now.toISOString();
  const hhmmss = stamp.slice(11, 19).replace(/:/g, "");
  const q = quarterLabel(now);
  const cutoff = Date.now() - 90 * 86400 * 1000;

  const ledger = await readDecisionLedger(paths);
  const conflicts = await readConflicts(paths);
  const drift = await readKnowledgeDrift(paths);
  const alerts = await readEvidenceChangeAlerts(paths);
  const loops = await readOpenLoops(paths);
  const exec = await readExecutiveSnapshot(paths);
  const runs = await listRuns(paths, 60);
  const coverage = await computeDomainCoverage(cfg);
  const cards = await buildDomainScorecards(cfg);

  const recentDecisions = ledger.decisions.filter((d) => {
    if (!d.date) return false;
    const t = Date.parse(d.date.includes("T") ? d.date : `${d.date}T12:00:00Z`);
    return !Number.isNaN(t) && t >= cutoff;
  });

  const resolvedConflicts = conflicts.items.filter((c) => c.status === "resolved");
  const resolvedDrift = drift.items.filter((d) => d.status === "resolved");

  const strongDomains = cards.filter((c) => c.completeness === "strong" && c.freshness === "strong");
  const weakDomains = cards.filter(
    (c) => c.completeness === "attention" || c.freshness === "attention" || c.synthesisDepth === "attention"
  );

  const openLoopsOld = loops.items.filter((l) => {
    if (l.status !== "open") return false;
    return Date.parse(l.createdAt) < cutoff;
  });

  const evidenceHigh = alerts.alerts.filter(
    (a) => a.severity === "high" && Date.parse(a.createdAt) >= cutoff
  );

  const outputFiles = await fg(path.join(paths.outputs, "**/*.md").replace(/\\/g, "/"), {
    onlyFiles: true,
  });
  const recentOutputs = [];
  for (const abs of outputFiles) {
    const st = await fs.stat(abs);
    if (st.mtimeMs >= cutoff) {
      recentOutputs.push(path.relative(cfg.root, abs).split(path.sep).join("/"));
    }
  }
  recentOutputs.sort();

  const lines: string[] = [
    "---",
    `title: Operational quarterly review`,
    `kind: quarterly-review`,
    `quarter: ${q}`,
    `generated: ${stamp}`,
    `brain_operation: governance_quarterly_synthesis`,
    "---",
    "",
    `_Strategic reflection from **local, file-based** signals — advisory heuristics only._`,
    "",
    "## Headline",
    exec?.headline ?? "Run `brain lint` (or governance refresh) to populate executive snapshot.",
    "",
    "## Major decisions (dated in ~last 90 days)",
    ...recentDecisions.slice(0, 24).map((d) => `- **${d.title}** (${d.status}) — \`${d.wikiPath}\``),
    recentDecisions.length ? "" : "- _(none with parseable dates in window — see Decision Ledger for full list)_",
    "",
    "## Resolved tensions (ledger totals — not period-exact)",
    `- Conflicts marked resolved: **${resolvedConflicts.length}**`,
    `- Drift items resolved: **${resolvedDrift.length}**`,
    "",
    "## Domains — stronger",
    ...strongDomains.map((c) => `- **${c.domain}** — ${c.summary}`),
    "",
    "## Domains — need care",
    ...weakDomains.map((c) => `- **${c.domain}** — ${c.summary}`),
    "",
    "## Coverage deltas (raw vs wiki)",
    ...coverage
      .filter((c) => c.gapScore > 0.45)
      .slice(0, 12)
      .map((c) => `- **${c.domain}** gap ${c.gapScore.toFixed(2)} — ${c.suggestedActions[0] ?? "review"}`),
    "",
    "## Evidence / support shifts (alerts in window)",
    ...evidenceHigh
      .slice(0, 20)
      .map((a) => `- \`${a.pagePath}\` — ${a.changeSummary} — _${a.why}_`),
    evidenceHigh.length ? "" : "- _(no high-severity evidence alerts in the last ~90 days)_",
    "",
    "## Open loops still aging (>90d)",
    ...openLoopsOld.slice(0, 20).map((l) => `- ${l.title} — since \`${l.createdAt.slice(0, 10)}\``),
    "",
    "## Key outputs touched (recent markdown under outputs/)",
    ...recentOutputs.slice(0, 40).map((p) => `- \`${p}\``),
    "",
    "## Recent runs (sample)",
    ...runs.slice(0, 15).map((r) => `- \`${r.startedAt.slice(0, 10)}\` **${r.kind}** — ${r.summary}`),
    "",
    "## Prompts for your own reflection",
    "- What assumptions from last quarter no longer hold?",
    "- Which decisions would you reverse with new information?",
    "- Where did canon pages drift from practice?",
    "",
  ];

  await fs.mkdir(paths.reviewsDir, { recursive: true });
  const fname = `quarterly-review-${q}-${stamp.slice(0, 10)}-${hhmmss}.md`;
  const outPath = path.join(paths.reviewsDir, fname);
  await fs.writeFile(outPath, lines.join("\n"), "utf8");
  return path.relative(cfg.root, outPath).split(path.sep).join("/");
}

function quarterlyReviewSortKey(basename: string): number {
  const m = /^quarterly-review-Q(\d+)-(\d{4})-/i.exec(basename);
  if (m) {
    const q = parseInt(m[1]!, 10);
    const y = parseInt(m[2]!, 10);
    return y * 10 + q;
  }
  return 0;
}

export async function listQuarterlyReviewFiles(cfg: BrainConfig, limit = 20): Promise<string[]> {
  const paths = brainPaths(cfg.root);
  const files = await fg(
    path.join(paths.reviewsDir, "quarterly-review-*.md").replace(/\\/g, "/"),
    { onlyFiles: true }
  );
  const scored = await Promise.all(
    files.map(async (abs) => {
      const base = path.basename(abs);
      let key = quarterlyReviewSortKey(base);
      if (!key) {
        try {
          const st = await fs.stat(abs);
          key = st.mtimeMs;
        } catch {
          key = 0;
        }
      }
      return { abs, key };
    })
  );
  return scored
    .sort((a, b) => b.key - a.key)
    .slice(0, limit)
    .map((x) => path.relative(cfg.root, x.abs).split(path.sep).join("/"));
}

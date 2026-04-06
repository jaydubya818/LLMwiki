import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { readDecisionLedger } from "../trust/decision-ledger.js";
import { readStrategicThemes } from "./strategic-themes.js";
import { readReviewDebt } from "./review-debt.js";
import { readConfidenceHistory, summarizeConfidenceForPage } from "./confidence-history.js";
import { readCanonPromotions } from "./canon-promotions.js";
import { readResolutions } from "./resolutions.js";

/**
 * Reflective annual memo from local artifacts — no activity metrics theater.
 */
export async function generateAnnualReflectiveReview(cfg: BrainConfig): Promise<string> {
  const paths = brainPaths(cfg.root);
  const yearMs = 365 * 86400000;
  const since = Date.now() - yearMs;

  const quarterlies = await fg(
    path.join(paths.reviewsDir, "quarterly-review-*.md").replace(/\\/g, "/"),
    { onlyFiles: true }
  );
  const quarterliesRecent = [] as string[];
  for (const abs of quarterlies) {
    const st = await fs.stat(abs);
    if (st.mtimeMs >= since) quarterliesRecent.push(path.relative(cfg.root, abs).split(path.sep).join("/"));
  }
  quarterliesRecent.sort();

  const diffs = await fg(
    path.join(paths.reviewsDir, "quarter-diff-*.md").replace(/\\/g, "/"),
    { onlyFiles: true }
  );
  const diffRel: string[] = [];
  for (const abs of diffs) {
    const st = await fs.stat(abs);
    if (st.mtimeMs >= since) diffRel.push(path.relative(cfg.root, abs).split(path.sep).join("/"));
  }
  diffRel.sort();

  const ledger = await readDecisionLedger(paths);
  const themes = await readStrategicThemes(paths);
  const debt = await readReviewDebt(paths);
  const conf = await readConfidenceHistory(paths);
  const promos = await readCanonPromotions(paths);
  const res = await readResolutions(paths);

  const decisions = ledger.decisions.filter((d) => {
    if (!d.date) return false;
    const t = Date.parse(d.date.includes("T") ? d.date : `${d.date}T12:00:00Z`);
    return !Number.isNaN(t) && t >= since;
  });

  const reversed = decisions.filter((d) => d.status === "reversed" || d.status === "superseded");
  const promoDone = promos.items.filter((p) => p.status === "promoted" && Date.parse(p.updatedAt) >= since);

  const resolutionsRecent = res.items.filter((r) => Date.parse(r.resolvedAt) >= since);

  let improving = 0;
  let declining = 0;
  for (const p of conf?.pages ?? []) {
    const s = summarizeConfidenceForPage(conf, p.path);
    if (s.trend === "improving") improving++;
    if (s.trend === "declining") declining++;
  }

  const themeLines =
    (themes?.themes ?? []).filter((t) => t.status === "active" || t.status === "emerging").length > 0
      ? (themes?.themes ?? [])
          .filter((t) => t.status === "active" || t.status === "emerging")
          .slice(0, 12)
          .map((t) => `- **${t.title}** — strength ${t.signalStrength}/10 — ${t.recurrenceNotes[0] ?? ""}`)
      : ["- Run operational refresh to populate `.brain/strategic-themes.json`."];

  const lines = [
    "---",
    "title: Reflective annual review",
    "kind: annual-review",
    `generated: ${new Date().toISOString()}`,
    "brain_operation: governance_annual_synthesis",
    "---",
    "",
    "_Year-shaped reflection from **local** quarterly memos, governance JSON, and trust queues — advisory only._",
    "",
    "## How to read this",
    "This is a **synthesis aid**, not a scorecard. Pair with git history for ground truth on what actually changed.",
    "",
    "## Narrative arc (from decisions ledger, ~12 months)",
    `- Decisions with dates in window: **${decisions.length}**`,
    `- Marked reversed / superseded: **${reversed.length}**`,
    ...decisions
      .slice(0, 20)
      .map((d) => `- **${d.title}** (${d.status}) — \`${d.wikiPath}\``),
    ...(decisions.length ? [] : ["- _(no dated decisions in window — check ledger manually)_"]),
    "",
    "## Strategic themes (refreshed heuristics)",
    ...themeLines,
    "",
    "## Review debt trajectory",
    ...(debt
      ? [
          `- Current: **${debt.level}** (~score ${debt.score0to100}) · trend hint: **${debt.trendHint}**`,
          ...(debt.contributors?.[0]
            ? [
                `- Top contributor now: **${debt.contributors[0]!.label}** (${debt.contributors[0]!.count}).`,
              ]
            : []),
        ]
      : ["- No review-debt file yet — run refresh."]),
    "",
    "## Confidence deltas (page snapshots)",
    `- Pages with improving trend (approx): **${improving}**`,
    `- Pages with declining trend (approx): **${declining}**`,
    "_Trends are from composite heuristics in `.brain/confidence-history.json`, not ground truth._",
    "",
    "## Canon & promotions",
    `- Canon promotions completed in window (by updatedAt): **${promoDone.length}**`,
    "",
    "## Resolutions in window",
    `- Count: **${resolutionsRecent.length}**`,
    ...resolutionsRecent.slice(0, 15).map((r) => `- \`${r.resolvedAt.slice(0, 10)}\` — ${r.issueSummary.slice(0, 100)}`),
    "",
    "## Source artifacts you had this year",
    `### Quarterly reviews (${quarterliesRecent.length} files touched in ~12 months)`,
    ...quarterliesRecent.map((q) => `- \`${q}\``),
    `### Quarter-over-quarter diffs (${diffRel.length} in ~12 months)`,
    ...diffRel.map((q) => `- \`${q}\``),
    "",
    "## Reflection prompts",
    "- What single decision would you undo with hindsight?",
    "- Which theme kept returning despite attempts to close it?",
    "- Where did the knowledge system itself change (workflow, canon, tooling)?",
    "",
  ];

  await fs.mkdir(paths.reviewsDir, { recursive: true });
  const stamp = new Date().toISOString();
  const fname = `annual-review-${stamp.slice(0, 4)}-${stamp.slice(0, 10)}-${stamp.slice(11, 19).replace(/:/g, "")}.md`;
  const rel = path.join("outputs", "reviews", fname);
  await fs.writeFile(path.join(cfg.root, rel), lines.filter((x) => x !== "").join("\n"), "utf8");
  return rel.split(path.sep).join("/");
}

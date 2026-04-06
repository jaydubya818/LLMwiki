import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { computeDomainCoverage } from "../trust/coverage-gaps.js";
import { buildDomainScorecards } from "../trust/domain-scorecards.js";
import { readReviewPriority } from "../trust/review-priority.js";
import { readOpenLoops } from "../trust/open-loops.js";
import { readConflicts } from "../trust/conflicts.js";
import { readKnowledgeDrift } from "../trust/knowledge-drift.js";
import { readUnsupportedClaims } from "../trust/unsupported-claims.js";
import { readDecisionLedger } from "../trust/decision-ledger.js";
import { readPageQuality } from "../trust/page-quality.js";
import { readEvidenceDensity } from "./evidence-density.js";
import { readDriftDecisionLinks } from "./drift-decision-bridge.js";

export async function generateStewardDigestForDomain(
  cfg: BrainConfig,
  domain: string
): Promise<string> {
  const paths = brainPaths(cfg.root);
  const stamp = new Date().toISOString();
  const hhmmss = stamp.slice(11, 19).replace(/:/g, "");
  const safeDomain = domain.replace(/[^\w-]+/g, "-").slice(0, 40);

  const coverage = await computeDomainCoverage(cfg);
  const row = coverage.find((c) => c.domain === domain);
  const scorecards = await buildDomainScorecards(cfg);
  const card = scorecards.find((s) => s.domain === domain);

  const queue = await readReviewPriority(paths);
  const domainPages = (
    await fg(path.join(paths.wiki, domain, "*.md").replace(/\\/g, "/"), { onlyFiles: true })
  ).map((abs) => path.relative(cfg.root, abs).split(path.sep).join("/"));

  const pq = await readPageQuality(paths);
  const inDomain = pq?.pages.filter((p) => p.path.startsWith(`wiki/${domain}/`)) ?? [];
  const weak = [...inDomain].sort((a, b) => a.score0to100 - b.score0to100).slice(0, 6);
  const strong = [...inDomain].sort((a, b) => b.score0to100 - a.score0to100).slice(0, 6);

  const loops = await readOpenLoops(paths);
  const loopDomain = loops.items
    .filter((l) => l.domain === domain && l.status === "open")
    .slice(0, 10);

  const conflicts = await readConflicts(paths);
  const confDomain = conflicts.items
    .filter(
      (c) =>
        c.status !== "resolved" &&
        c.status !== "ignored" &&
        (c.sourceA.includes(`/${domain}/`) || c.sourceB.includes(`/${domain}/`))
    )
    .slice(0, 8);

  const drift = await readKnowledgeDrift(paths);
  const driftDomain = drift.items
    .filter((d) => d.status !== "resolved" && d.pagePath.includes(`/${domain}/`))
    .slice(0, 8);

  const uns = await readUnsupportedClaims(paths);
  const unsDomain = uns.items
    .filter((u) => u.status !== "resolved" && u.pagePath.includes(`/${domain}/`))
    .slice(0, 10);

  const ledger = await readDecisionLedger(paths);
  const decisions = ledger.decisions
    .filter((d) => d.domain === domain || d.wikiPath.includes(`/${domain}/`))
    .slice(0, 8);

  const evidence = await readEvidenceDensity(paths);
  const thinEv = (evidence?.pages ?? [])
    .filter((p) => p.path.startsWith(`wiki/${domain}/`) && p.bucket === "low")
    .slice(0, 6);
  const bridge = await readDriftDecisionLinks(paths);
  const bridgeDomain = (bridge?.links ?? []).filter((l) => l.pagePath.includes(`/${domain}/`)).slice(0, 6);

  const prioRows =
    queue?.queue.filter((q) => domainPages.includes(q.path)).slice(0, 12) ?? [];

  const lines: string[] = [
    "---",
    `title: Steward digest — ${domain}`,
    `kind: steward-digest`,
    `domain: ${domain}`,
    `generated: ${stamp}`,
    `brain_operation: deterministic_governance_digest`,
    "---",
    "",
    `_Heuristic briefing — not a scoreboard. Domain: **${domain}**._`,
    "",
    "## Recent coverage signal",
    row
      ? `- Raw/wiki ratio ~${row.rawToWikiRatio.toFixed(2)}, gap score ${row.gapScore.toFixed(2)}. Suggested: ${row.suggestedActions[0] ?? "—"}`
      : "- No coverage row (unexpected domain folder?).",
    card
      ? `- Scorecard bands: completeness ${card.completeness}, freshness ${card.freshness}, linkage ${card.linkage}.`
      : "",
    "",
    "## Decisions (domain)",
    ...decisions.map((d) => `- [[${d.title}]] — \`${d.wikiPath}\` (${d.status})`),
    decisions.length ? "" : "- _(none indexed in ledger for this domain)_",
    "",
    "## Review priorities (this domain)",
    ...prioRows.map((r) => `- \`${r.path}\` — **${r.bucket}** (${r.priority0to100}): ${r.why[0] ?? ""}`),
    prioRows.length ? "" : "- _(no queued pages in this domain — run lint/refresh after wiki edits)_",
    "",
    "## Open loops",
    ...loopDomain.map((l) => `- ${l.title} — \`${l.sourcePath}\``),
    "",
    "## Conflicts touching domain",
    ...confDomain.map((c) => `- ${c.topic} (${c.id})`),
    "",
    "## Drift",
    ...driftDomain.map((d) => `- ${d.summary} — \`${d.pagePath}\``),
    "",
    "## Unsupported claims",
    ...unsDomain.map((u) => `- ${u.excerpt.slice(0, 100)}… — \`${u.pagePath}\``),
    "",
    "## Evidence density (thin pages)",
    ...thinEv.map(
      (e) =>
        `- \`${e.path}\` (${e.bucket}, ${e.score0to100}) — ${e.reasons.slice(0, 2).join("; ")}`
    ),
    thinEv.length ? "" : "- _(no low-density rows in this domain — or run operational refresh)_",
    "",
    "## Drift ↔ decision bridge",
    ...bridgeDomain.map(
      (b) =>
        `- Drift \`${b.pagePath}\` → decisions: ${b.decisionPaths.map((d) => `\`${d}\``).join(", ")}`
    ),
    bridgeDomain.length ? "" : "- _(no linked drift in this domain)_",
    "",
    "## Page quality — weaker pages",
    ...weak.map((w) => `- \`${w.path}\` score ${w.score0to100} (${w.bucket})`),
    "",
    "## Page quality — stronger pages",
    ...strong.map((w) => `- \`${w.path}\` score ${w.score0to100} (${w.bucket})`),
    "",
    "## Suggested next moves",
    "- Skim **weaker** pages for unsupported tone or missing sources.",
    "- Close or mark **drift** items if wiki is current.",
    "- If **conflicts** are stale, resolve or accept tension explicitly.",
    "",
  ];

  const outDir = paths.reviewsDir;
  await fs.mkdir(outDir, { recursive: true });
  const fname = `steward-digest-${safeDomain}-${stamp.slice(0, 10)}-${hhmmss}.md`;
  const outPath = path.join(outDir, fname);
  await fs.writeFile(outPath, lines.filter(Boolean).join("\n"), "utf8");
  return path.relative(cfg.root, outPath).split(path.sep).join("/");
}

export async function generateAllStewardDigests(cfg: BrainConfig): Promise<string[]> {
  const cov = await computeDomainCoverage(cfg);
  const out: string[] = [];
  for (const c of cov) {
    if (c.wikiCount === 0 && c.rawCount === 0) continue;
    out.push(await generateStewardDigestForDomain(cfg, c.domain));
  }
  return out;
}

export async function listStewardDigestFiles(cfg: BrainConfig, limit = 40): Promise<string[]> {
  const paths = brainPaths(cfg.root);
  const files = await fg(
    path.join(paths.reviewsDir, "steward-digest-*.md").replace(/\\/g, "/"),
    { onlyFiles: true }
  );
  return files
    .sort()
    .reverse()
    .slice(0, limit)
    .map((abs) => path.relative(cfg.root, abs).split(path.sep).join("/"));
}

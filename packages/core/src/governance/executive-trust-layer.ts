import fs from "node:fs/promises";
import path from "node:path";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";
import type { KnowledgeGraph } from "../graph/builder.js";
import { readCanonicalBoard, type CanonicalBoardItem } from "./canonical-board.js";
import { readReviewDebt } from "./review-debt.js";
import { readCrossSignal } from "./cross-signal.js";
import { readConfidenceHistory, summarizeConfidenceForPage } from "./confidence-history.js";
import { readEvidenceChangeAlerts } from "./evidence-change.js";
import { readCanonPromotions } from "./canon-promotions.js";
import { readReviewPriority } from "../trust/review-priority.js";
import { readCanonDriftWatchlist } from "./canon-watchlist.js";
import { readDecisionImpact } from "./decision-impact.js";
import { applyExecutiveActionTelemetryToSummary } from "./executive-trust-telemetry.js";

export type TrustPostureBucket =
  | "strong"
  | "stable_watchlist"
  | "mixed"
  | "fragile"
  | "high_attention";

export type FragilityLevel = "low" | "moderate" | "elevated" | "high" | "critical";

export interface CanonFragilityEntry {
  path: string;
  title: string;
  fragilityLevel: FragilityLevel;
  /** Heuristic 0–100 — higher = more brittle (not certainty). */
  fragilityScore0to100: number;
  fragilityDrivers: string[];
  trustStatus: string;
  whyItMatters: string;
  linkedSignals: string[];
  suggestedNextAction: string;
  trendDirection?: "improving" | "declining" | "stable" | "unknown";
  generatedAt: string;
}

export interface CanonFragilityFile {
  version: 1;
  updatedAt: string;
  entries: CanonFragilityEntry[];
  /** Plain-language note */
  note: string;
}

export interface DomainTrustRow {
  /** wiki top-level folder */
  domain: string;
  pageCount: number;
  highTrustPages: number;
  elevatedFragilityPlus: number;
  topIssue: string;
  postureHint: "healthy" | "mixed" | "stressed";
  suggestedFocus: string;
}

export interface TrustWinItem {
  path: string;
  title: string;
  reason: string;
}

export interface ExecutiveAction {
  label: string;
  href: string;
  kind: "nav" | "cli";
  cliHint?: string;
  /** Stable id — matches governance-action-log refId (executive_action_key). */
  actionKey?: string;
  /** For path-specific actions (e.g. top fragile page), completion is keyed to this path. */
  targetPath?: string;
  /** Filled when merging telemetry from the action log (rolling window). */
  lastMarkedDoneAt?: string;
}

export interface ExecutiveTrustSummary {
  version: 1;
  generatedAt: string;
  overallPosture: TrustPostureBucket;
  postureExplanation: string;
  summaryLine: string;
  keyStats: {
    highTrustPagesOnBoard: number;
    fragilityElevatedOrHigher: number;
    fragilityHighOrCritical: number;
    reviewDebtLevel?: string;
    reviewDebtScore0to100?: number;
    openCrossSignalHotspots: number;
    pendingCanonPromotions: number;
    urgentReviewQueue: number;
  };
  topActions: ExecutiveAction[];
  topFragilePages: { path: string; title: string; level: FragilityLevel; drivers: string[] }[];
  trustWins: TrustWinItem[];
  canonPostureLine: string;
  debtPostureLine: string;
  domains: DomainTrustRow[];
  highPriorityReview: { path: string; bucket: string; why: string }[];
  majorDrivers: string[];
  hotspotsLine?: string;
  /** Optional — added when merging log-derived completion hints. */
  actionTelemetry?: {
    windowDays: number;
    suggestedCount: number;
    addressedInWindow: number;
  };
  relatedFiles: {
    canonFragility: string;
    executiveTrustSummary: string;
  };
}

function domainFromWikiPath(p: string): string {
  const n = p.replace(/^\/+/, "");
  if (!n.startsWith("wiki/")) return "other";
  const rest = n.slice("wiki/".length);
  const i = rest.indexOf("/");
  return i === -1 ? "_" : rest.slice(0, i);
}

function fragilityLevelFromScore(s: number): FragilityLevel {
  if (s >= 82) return "critical";
  if (s >= 66) return "high";
  if (s >= 46) return "elevated";
  if (s >= 28) return "moderate";
  return "low";
}

function isHighTrustBoardItem(i: CanonicalBoardItem): boolean {
  return i.isCanonicalFm || i.policy !== "open";
}

export async function buildCanonFragilityIndex(
  cfg: BrainConfig,
  graph: KnowledgeGraph | null
): Promise<CanonFragilityFile> {
  const paths = brainPaths(cfg.root);
  const generatedAt = new Date().toISOString();
  const board = await readCanonicalBoard(paths);
  const xsig = await readCrossSignal(paths);
  const ch = await readConfidenceHistory(paths);
  const alerts = await readEvidenceChangeAlerts(paths);
  const watch = await readCanonDriftWatchlist(paths);

  const dragonBy = new Map((xsig?.items ?? []).map((x) => [x.path.replace(/^\/+/, ""), x]));
  const hubBy = new Map<string, number>();
  if (graph) for (const n of graph.nodes) hubBy.set(n.id.replace(/^\/+/, ""), n.hubScore);

  const watchPages = new Set((watch?.rows ?? []).map((r) => r.pagePath.replace(/^\/+/, "")));
  const alertBump = new Map<string, number>();
  for (const a of alerts.alerts) {
    if (a.status === "resolved" || a.status === "ignored") continue;
    const p = a.pagePath.replace(/^\/+/, "");
    const add = a.severity === "high" ? 14 : a.severity === "medium" ? 7 : 3;
    alertBump.set(p, (alertBump.get(p) ?? 0) + add);
  }

  const entries: CanonFragilityEntry[] = [];

  for (const i of board?.items ?? []) {
    if (!isHighTrustBoardItem(i)) continue;

    let s = 8;
    const drivers: string[] = [];
    const linked: string[] = [];
    const norm = i.path.replace(/^\/+/, "");

    if (i.evidenceBucket === "low" || (i.evidenceScore0to100 != null && i.evidenceScore0to100 < 38)) {
      s += 18;
      drivers.push("evidence density is thin for a trusted page");
      linked.push("evidence-density");
    } else if (i.evidenceBucket === "moderate") {
      s += 6;
      drivers.push("evidence is only moderate");
    }

    if (i.qualityBucket === "low" || (i.qualityScore0to100 != null && i.qualityScore0to100 < 38)) {
      s += 14;
      drivers.push("page quality bucket is weak");
      linked.push("page-quality");
    }

    if (i.unsupportedOpen > 0) {
      s += Math.min(24, 6 + i.unsupportedOpen * 6);
      drivers.push(`${i.unsupportedOpen} open unsupported claim(s)`);
      linked.push("unsupported-claims");
    }

    if (i.driftOpen) {
      s += 14;
      drivers.push("open knowledge drift");
      linked.push("drift");
    }

    if (i.conflictOpen) {
      s += 14;
      drivers.push("open conflict");
      linked.push("conflicts");
    }

    if (i.urgency === "attention") {
      s += 10;
      drivers.push("canonical board urgency: attention");
      linked.push("canonical-board");
    }

    const xs = dragonBy.get(norm);
    if (xs) {
      s += Math.min(18, Math.round(xs.dragonScore / 5));
      drivers.push(`cross-signal: ${xs.headline}`);
      linked.push("cross-signal");
    }

    const conf = summarizeConfidenceForPage(ch, norm);
    if (conf.trend === "declining") {
      s += 12;
      drivers.push("advisory confidence trend declining");
      linked.push("confidence-history");
    }

    const ab = alertBump.get(norm) ?? 0;
    if (ab > 0) {
      s += Math.min(20, ab);
      drivers.push("recent evidence-shape alerts");
      linked.push("evidence-alerts");
    }

    if (watchPages.has(norm)) {
      s += 8;
      drivers.push("on canon drift watchlist");
      linked.push("canon-watchlist");
    }

    const hub = hubBy.get(norm) ?? 0;
    if (hub >= 12 && (i.evidenceBucket === "low" || i.evidenceBucket === "moderate")) {
      s += 8;
      drivers.push("graph hub is high but grounding looks thin — brittle centrality");
      linked.push("graph");
    }

    for (const w of i.warnings.slice(0, 4)) {
      if (/\bstale|review|thin|weak/i.test(w)) {
        s += 4;
        drivers.push(`board warning: ${w}`);
        break;
      }
    }

    s = Math.min(100, Math.round(s));
    const level = fragilityLevelFromScore(s);

    let why =
      level === "low"
        ? "Trusted page with relatively few structural warnings in this pass."
        : "Trusted knowledge that may mislead if context drifts — worth periodic verification.";

    if (i.isCanonicalFm) why += " Marked canonical in frontmatter.";
    if (hub >= 15) why += " Highly linked in the wiki graph.";

    let action = "Skim content and trace; run snapshot before large edits.";
    if (i.unsupportedOpen > 0) action = "Triage unsupported claims for this page.";
    if (i.driftOpen || i.conflictOpen) action = "Resolve drift or conflict workflow first.";
    if (level === "critical" || level === "high") action = "Schedule focused review or canon council item.";

    entries.push({
      path: i.path,
      title: i.title,
      fragilityLevel: level,
      fragilityScore0to100: s,
      fragilityDrivers: [...new Set(drivers)].slice(0, 8),
      trustStatus: `${i.lockLabel}${i.isCanonicalFm ? " · canonical" : ""}`,
      whyItMatters: why,
      linkedSignals: [...new Set(linked)],
      suggestedNextAction: action,
      trendDirection: conf.trend,
      generatedAt,
    });
  }

  entries.sort((a, b) => b.fragilityScore0to100 - a.fragilityScore0to100);

  return {
    version: 1,
    updatedAt: generatedAt,
    entries: entries.slice(0, 80),
    note: "Heuristic fragility — not proof of error. High-trust pages only. Regenerated with governance refresh / brain executive-trust.",
  };
}

export async function writeCanonFragility(paths: BrainPaths, f: CanonFragilityFile): Promise<void> {
  await fs.mkdir(paths.brain, { recursive: true });
  await fs.writeFile(paths.canonFragilityJson, JSON.stringify(f, null, 2), "utf8");
}

export async function readCanonFragility(paths: BrainPaths): Promise<CanonFragilityFile | null> {
  try {
    const raw = await fs.readFile(paths.canonFragilityJson, "utf8");
    return JSON.parse(raw) as CanonFragilityFile;
  } catch {
    return null;
  }
}

function derivePosture(args: {
  elevatedPlus: number;
  highCritical: number;
  debtLevel?: string;
  urgentQ: number;
  wins: number;
}): { bucket: TrustPostureBucket; explanation: string; drivers: string[] } {
  const drivers: string[] = [];
  if (args.highCritical >= 3 || args.debtLevel === "critical") {
    return {
      bucket: "high_attention",
      explanation:
        "Several high-trust pages look structurally brittle and/or review debt is critical — treat this as a focused review week.",
      drivers: [
        `${args.highCritical} page(s) at high/critical fragility`,
        args.debtLevel ? `review debt: ${args.debtLevel}` : "",
      ].filter(Boolean),
    };
  }
  if (args.highCritical >= 1 || args.elevatedPlus >= 6 || args.debtLevel === "high") {
    drivers.push(`${args.elevatedPlus} elevated+ fragility rows`, `${args.highCritical} high/critical`);
    if (args.debtLevel) drivers.push(`debt ${args.debtLevel}`);
    return {
      bucket: "fragile",
      explanation:
        "Trusted knowledge has multiple weak support or warning clusters — schedule targeted reviews before expanding canon.",
      drivers,
    };
  }
  if (args.elevatedPlus >= 3 || args.debtLevel === "moderate" || args.urgentQ >= 3) {
    return {
      bucket: "mixed",
      explanation:
        "Overall shape is workable, but several domains or pages need attention — use fragility + review queue to prioritize.",
      drivers: [`${args.elevatedPlus} elevated+ fragility`, `urgent queue: ${args.urgentQ}`],
    };
  }
  if (args.elevatedPlus >= 1 || args.debtLevel === "moderate") {
    return {
      bucket: "stable_watchlist",
      explanation:
        "Most canon looks steady; a small watchlist of elevated fragility is normal — skim monthly.",
      drivers,
    };
  }
  if (args.wins >= 3 && (args.debtLevel === "low" || !args.debtLevel)) {
    return {
      bucket: "strong",
      explanation:
        "Advisory signals look healthy: several strong trust wins and low review debt — keep the weekly rhythm.",
      drivers: [`${args.wins} highlight win(s) on trusted pages`],
    };
  }
  return {
    bucket: "stable_watchlist",
    explanation: "No sharp red clusters in this pass — still scan fragility before major canon edits.",
    drivers: [],
  };
}

export async function buildExecutiveTrustSummary(
  cfg: BrainConfig,
  frag: CanonFragilityFile | null
): Promise<ExecutiveTrustSummary> {
  const paths = brainPaths(cfg.root);
  const generatedAt = new Date().toISOString();
  const board = await readCanonicalBoard(paths);
  const debt = await readReviewDebt(paths);
  const xsig = await readCrossSignal(paths);
  const promos = await readCanonPromotions(paths);
  const pri = await readReviewPriority(paths);
  const impact = await readDecisionImpact(paths);

  const highTrustOnBoard = (board?.items ?? []).filter(isHighTrustBoardItem).length;
  const entries = frag?.entries ?? [];

  const elevatedPlus = entries.filter((e) =>
    ["elevated", "high", "critical"].includes(e.fragilityLevel)
  ).length;
  const highCritical = entries.filter((e) => ["high", "critical"].includes(e.fragilityLevel)).length;

  const wins: TrustWinItem[] = [];
  for (const i of board?.items ?? []) {
    if (!isHighTrustBoardItem(i)) continue;
    if (i.urgency !== "ok") continue;
    if (i.driftOpen || i.conflictOpen || i.unsupportedOpen > 0) continue;
    if (i.evidenceBucket === "low") continue;
    if (i.qualityBucket === "low") continue;
    wins.push({
      path: i.path,
      title: i.title,
      reason: `${i.evidenceBucket ?? "—"} evidence · ${i.qualityBucket ?? "—"} quality · no open drift/conflict/unsupported`,
    });
    if (wins.length >= 8) break;
  }

  const { bucket, explanation, drivers } = derivePosture({
    elevatedPlus,
    highCritical,
    debtLevel: debt?.level,
    urgentQ: (pri?.queue ?? []).filter((r) => r.bucket === "urgent").length,
    wins: wins.length,
  });

  const promoPending = (promos?.items ?? []).filter(
    (p) => p.status === "new" || p.status === "reviewing"
  ).length;

  const hotspotCount = (xsig?.items ?? []).filter((x) => x.dragonScore >= 35).length;

  const impactBusy = (impact?.entries ?? []).filter(
    (e) => (e.conflicts?.length ?? 0) + (e.drift?.length ?? 0) + (e.unsupported?.length ?? 0) > 0
  ).length;
  const impactNote =
    impactBusy > 0 ? `${impactBusy} decision impact row(s) with open drift/conflict/unsupported ties` : "";

  const summaryLine = `Trust posture: ${bucket.replace(/_/g, " ")} — ${explanation.slice(0, 120)}${explanation.length > 120 ? "…" : ""}`;

  const topFragile = entries.slice(0, 8).map((e) => ({
    path: e.path,
    title: e.title,
    level: e.fragilityLevel,
    drivers: e.fragilityDrivers.slice(0, 3),
  }));

  const highPri = (pri?.queue ?? [])
    .filter((r) => r.bucket === "urgent" || r.bucket === "soon")
    .slice(0, 6)
    .map((r) => ({
      path: r.path,
      bucket: r.bucket,
      why: (r.why ?? []).slice(0, 2).join(" · ") || "see review queue",
    }));

  const domainMap = new Map<string, { pages: Set<string>; highTrust: number; fragile: number; issues: string[] }>();
  for (const i of board?.items ?? []) {
    const d = domainFromWikiPath(i.path);
    if (!domainMap.has(d)) domainMap.set(d, { pages: new Set(), highTrust: 0, fragile: 0, issues: [] });
    const row = domainMap.get(d)!;
    row.pages.add(i.path);
    if (isHighTrustBoardItem(i)) row.highTrust += 1;
  }
  for (const e of entries) {
    const d = domainFromWikiPath(e.path);
    if (!domainMap.has(d)) domainMap.set(d, { pages: new Set(), highTrust: 0, fragile: 0, issues: [] });
    const row = domainMap.get(d)!;
    if (["elevated", "high", "critical"].includes(e.fragilityLevel)) {
      row.fragile += 1;
      row.issues.push(e.title);
    }
  }

  const domains: DomainTrustRow[] = [...domainMap.entries()]
    .filter(([k]) => k !== "other" && k !== "_")
    .map(([d, v]) => {
      let hint: DomainTrustRow["postureHint"] = "healthy";
      if (v.fragile >= 3) hint = "stressed";
      else if (v.fragile >= 1) hint = "mixed";
      const topIssue =
        v.fragile > 0
          ? `${v.fragile} elevated+ fragile trusted page(s)`
          : v.highTrust > 0
            ? `${v.highTrust} high-trust page(s), no fragility spike`
            : "mostly open pages";
      return {
        domain: d,
        pageCount: v.pages.size,
        highTrustPages: v.highTrust,
        elevatedFragilityPlus: v.fragile,
        topIssue,
        postureHint: hint,
        suggestedFocus:
          v.fragile > 0 ? "Open canon fragility → pick one page for review" : "Light maintenance OK",
      };
    })
    .sort((a, b) => b.elevatedFragilityPlus - a.elevatedFragilityPlus)
    .slice(0, 12);

  const majorDrivers = [
    ...drivers,
    debt ? `review debt ${debt.level} (~${debt.score0to100}/100)` : "",
    promoPending ? `${promoPending} pending canon promotion(s)` : "",
    hotspotCount ? `${hotspotCount} cross-signal hotspot(s) (score ≥35)` : "",
    impactNote,
  ].filter(Boolean);

  const actions: ExecutiveAction[] = [
    { label: "Canon fragility", href: "/canon-fragility", kind: "nav", actionKey: "nav_canon_fragility" },
    { label: "Executive trust (full)", href: "/executive-trust", kind: "nav", actionKey: "nav_executive_trust" },
    { label: "Review session", href: "/review-session", kind: "nav", actionKey: "nav_review_session" },
    { label: "Canon council", href: "/canon-council", kind: "nav", actionKey: "nav_canon_council" },
    { label: "Review priority", href: "/review-queue", kind: "nav", actionKey: "nav_review_queue" },
    { label: "Decision sunset", href: "/decision-sunset", kind: "nav", actionKey: "nav_decision_sunset" },
    { label: "Drift", href: "/drift", kind: "nav", actionKey: "nav_drift" },
    { label: "Conflicts", href: "/conflicts", kind: "nav", actionKey: "nav_conflicts" },
  ];
  if (topFragile[0]) {
    actions.unshift({
      label: `Review fragile: ${topFragile[0].title.slice(0, 40)}`,
      href: `/wiki?path=${encodeURIComponent(topFragile[0].path)}`,
      kind: "nav",
      actionKey: "review_fragile_top",
      targetPath: topFragile[0].path,
    });
  }

  const base: ExecutiveTrustSummary = {
    version: 1,
    generatedAt,
    overallPosture: bucket,
    postureExplanation: explanation,
    summaryLine,
    keyStats: {
      highTrustPagesOnBoard: highTrustOnBoard,
      fragilityElevatedOrHigher: elevatedPlus,
      fragilityHighOrCritical: highCritical,
      reviewDebtLevel: debt?.level,
      reviewDebtScore0to100: debt?.score0to100,
      openCrossSignalHotspots: hotspotCount,
      pendingCanonPromotions: promoPending,
      urgentReviewQueue: (pri?.queue ?? []).filter((r) => r.bucket === "urgent").length,
    },
    topActions: actions.slice(0, 10),
    topFragilePages: topFragile,
    trustWins: wins.slice(0, 6),
    canonPostureLine: board
      ? `${highTrustOnBoard} high-trust row(s) on canonical board · ${promoPending} promotion(s) pending`
      : "Canonical board not yet built — run operational refresh / lint.",
    debtPostureLine: debt
      ? `Review debt ${debt.level} (~${debt.score0to100}/100) — ${debt.trendHint}`
      : "Review debt file missing — run governance refresh.",
    domains,
    highPriorityReview: highPri,
    majorDrivers,
    hotspotsLine: hotspotCount ? `${hotspotCount} pages with elevated cross-signal dragon scores` : undefined,
    relatedFiles: {
      canonFragility: ".brain/canon-fragility.json",
      executiveTrustSummary: ".brain/executive-trust-summary.json",
    },
  };

  return await applyExecutiveActionTelemetryToSummary(paths, base);
}

export async function writeExecutiveTrustSummary(paths: BrainPaths, s: ExecutiveTrustSummary): Promise<void> {
  await fs.mkdir(paths.brain, { recursive: true });
  await fs.writeFile(paths.executiveTrustSummaryJson, JSON.stringify(s, null, 2), "utf8");
}

export async function readExecutiveTrustSummary(paths: BrainPaths): Promise<ExecutiveTrustSummary | null> {
  try {
    const raw = await fs.readFile(paths.executiveTrustSummaryJson, "utf8");
    return JSON.parse(raw) as ExecutiveTrustSummary;
  } catch {
    return null;
  }
}

export function formatExecutiveTrustMarkdown(summary: ExecutiveTrustSummary, frag: CanonFragilityFile | null): string {
  const lines: string[] = [
    "---",
    `title: Executive trust summary`,
    `generated: ${summary.generatedAt}`,
    `posture: ${summary.overallPosture}`,
    "---",
    "",
    `# Executive trust summary`,
    "",
    summary.summaryLine,
    "",
    `## Posture (${summary.overallPosture.replace(/_/g, " ")})`,
    "",
    summary.postureExplanation,
    "",
    "### Major drivers",
    "",
    ...summary.majorDrivers.map((d) => `- ${d}`),
    "",
    "## Key stats",
    "",
    "```json",
    JSON.stringify(summary.keyStats, null, 2),
    "```",
    "",
    "## Top fragile pages",
    "",
    ...summary.topFragilePages.map((p) => `- **${p.title}** (\`${p.path}\`) — ${p.level}: ${p.drivers.join("; ")}`),
    "",
    "## Trust wins",
    "",
    ...summary.trustWins.map((w) => `- **${w.title}** — ${w.reason}`),
    "",
    "## Domains (high level)",
    "",
    ...summary.domains.map(
      (d) =>
        `- **${d.domain}**: ${d.topIssue} (${d.postureHint}) — ${d.suggestedFocus}`
    ),
    "",
    "## Recommended actions",
    "",
    ...summary.topActions.map((a) => {
      const done = a.lastMarkedDoneAt ? ` — marked done ${a.lastMarkedDoneAt.slice(0, 10)}` : "";
      return `- [${a.label}](${a.href})${done}`;
    }),
    "",
  ];
  if (frag?.entries?.length) {
    lines.push("## Canon fragility (top 12)", "");
    for (const e of frag.entries.slice(0, 12)) {
      lines.push(`### ${e.title}`, "", `Path: \`${e.path}\` · **${e.fragilityLevel}** (~${e.fragilityScore0to100})`, "");
      lines.push(`- ${e.whyItMatters}`, "");
      lines.push(`**Drivers:** ${e.fragilityDrivers.join("; ")}`, "");
      lines.push(`**Next:** ${e.suggestedNextAction}`, "");
    }
  }
  lines.push("_Heuristic only — prioritize, don’t treat as truth._", "");
  return lines.join("\n");
}

export async function writeExecutiveTrustMarkdownReport(
  cfg: BrainConfig,
  summary: ExecutiveTrustSummary,
  frag: CanonFragilityFile | null
): Promise<string> {
  const paths = brainPaths(cfg.root);
  await fs.mkdir(paths.reviewsDir, { recursive: true });
  const stamp = summary.generatedAt.replace(/[:.]/g, "-").slice(0, 19);
  const rel = path.join("outputs", "reviews", `executive-trust-summary-${stamp}.md`);
  const abs = path.join(cfg.root, rel);
  await fs.writeFile(abs, formatExecutiveTrustMarkdown(summary, frag), "utf8");
  return rel;
}

/** Regenerate JSON artifacts; optional markdown when writeMarkdown true. */
export async function refreshExecutiveTrustLayer(
  cfg: BrainConfig,
  graph: KnowledgeGraph | null,
  options: { writeMarkdown?: boolean } = {}
): Promise<{ errors: string[]; markdownRel?: string }> {
  const errors: string[] = [];
  const paths = brainPaths(cfg.root);
  let frag: CanonFragilityFile | null = null;
  try {
    frag = await buildCanonFragilityIndex(cfg, graph);
    await writeCanonFragility(paths, frag);
  } catch (e) {
    errors.push(`canon-fragility: ${String(e)}`);
  }
  try {
    const summary = await buildExecutiveTrustSummary(cfg, frag);
    await writeExecutiveTrustSummary(paths, summary);
    if (options.writeMarkdown && frag) {
      const rel = await writeExecutiveTrustMarkdownReport(cfg, summary, frag);
      return { errors, markdownRel: rel };
    }
  } catch (e) {
    errors.push(`executive-trust-summary: ${String(e)}`);
  }
  return { errors };
}

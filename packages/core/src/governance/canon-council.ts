import fs from "node:fs/promises";
import path from "node:path";
import type { BrainPaths } from "../paths.js";
import { brainPaths } from "../paths.js";
import type { BrainConfig } from "../config.js";
import { readCanonicalBoard } from "./canonical-board.js";
import { readCanonPromotions } from "./canon-promotions.js";
import { readCanonDriftWatchlist } from "./canon-watchlist.js";
import { readEvidenceChangeAlerts } from "./evidence-change.js";
import { readCrossSignal } from "./cross-signal.js";
import { readResolutions } from "./resolutions.js";

export type CanonCouncilItemKind =
  | "canonical_board"
  | "canon_promotion"
  | "watchlist"
  | "evidence_alert"
  | "cross_signal"
  | "recent_resolution";

export interface CanonCouncilLink {
  label: string;
  href: string;
}

export interface CanonCouncilItem {
  id: string;
  kind: CanonCouncilItemKind;
  path: string;
  title: string;
  canonicalState: string;
  warnings: string[];
  trustSummary: string;
  pendingActions: string[];
  recommendedNext: string;
  priorityScore: number;
  quickLinks: CanonCouncilLink[];
}

export interface CanonCouncilFile {
  version: 1;
  updatedAt: string;
  headline: string;
  items: CanonCouncilItem[];
}

export async function readCanonCouncil(paths: BrainPaths): Promise<CanonCouncilFile | null> {
  try {
    const raw = await fs.readFile(paths.canonCouncilJson, "utf8");
    return JSON.parse(raw) as CanonCouncilFile;
  } catch {
    return null;
  }
}

export async function writeCanonCouncil(paths: BrainPaths, f: CanonCouncilFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.canonCouncilJson), { recursive: true });
  await fs.writeFile(
    paths.canonCouncilJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

const cutoffMs = () => Date.now() - 14 * 86400000;

/**
 * Highest-signal canon governance rows — executive slice, not a full board copy.
 */
export async function buildCanonCouncil(cfg: BrainConfig): Promise<CanonCouncilFile> {
  const paths = brainPaths(cfg.root);
  const board = await readCanonicalBoard(paths);
  const promos = await readCanonPromotions(paths);
  const watch = await readCanonDriftWatchlist(paths);
  const alerts = await readEvidenceChangeAlerts(paths);
  const xsig = await readCrossSignal(paths);
  const res = await readResolutions(paths);

  const boardPaths = new Set((board?.items ?? []).map((i) => i.path));
  const items: CanonCouncilItem[] = [];
  const seen = new Set<string>();

  const push = (it: CanonCouncilItem) => {
    const k = `${it.kind}:${it.path}:${it.id}`;
    if (seen.has(k)) return;
    seen.add(k);
    items.push(it);
  };

  for (const i of board?.items ?? []) {
    if (i.urgency === "ok" && i.priorityScore < 52) continue;
    const state = [
      i.lockLabel,
      i.isCanonicalFm ? "canonical" : "",
      i.policy !== "open" ? `policy:${i.policy}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    push({
      id: `cc-board-${i.path}`,
      kind: "canonical_board",
      path: i.path,
      title: i.title,
      canonicalState: state || "wiki",
      warnings: i.warnings.slice(0, 6),
      trustSummary: `Priority ${i.priorityScore} · quality ${i.qualityBucket ?? "—"} · evidence ${i.evidenceBucket ?? "—"} · unsupported ${i.unsupportedOpen} · drift ${i.driftOpen ? "yes" : "no"} · conflict ${i.conflictOpen ? "yes" : "no"}`,
      pendingActions: [
        ...(i.pendingProposals > 0 ? [`${i.pendingProposals} proposed digest update(s)`] : []),
        ...(i.unsupportedOpen ? ["Clear or substantiate unsupported flags"] : []),
        ...(i.driftOpen ? ["Reconcile drift"] : []),
        ...(i.conflictOpen ? ["Resolve conflict"] : []),
      ],
      recommendedNext:
        i.pendingProposals > 0
          ? "Review proposed wiki update(s), then merge via git."
          : i.unsupportedOpen > 0
            ? "Open page + trace / sources."
            : i.driftOpen
              ? "Open drift queue for this path."
              : "Spot-check canon text vs practice.",
      priorityScore: i.priorityScore,
      quickLinks: [
        { label: "Wiki", href: `/wiki?path=${encodeURIComponent(i.path)}` },
        { label: "Canonical board", href: "/canonical-board" },
        { label: "Drift", href: "/drift" },
      ],
    });
  }

  for (const p of promos.items) {
    if (p.status !== "new" && p.status !== "reviewing" && p.status !== "approved") continue;
    const t = p.proposedTargetCanonicalPage.replace(/^\/+/, "");
    push({
      id: `cc-promo-${p.id}`,
      kind: "canon_promotion",
      path: t,
      title: p.promotionSummary.slice(0, 80) || p.id,
      canonicalState: `promotion:${p.status}`,
      warnings: [`From ${p.sourceType}`, p.sourceArtifactPath].filter(Boolean),
      trustSummary: (p.rationale ?? "").slice(0, 200) || "No rationale text.",
      pendingActions: [
        p.status === "approved" ? "Materialize proposal if not done" : "Review promotion decision",
        "Complete canon admission checklist",
      ],
      recommendedNext:
        p.status === "new"
          ? "Read rationale + target page; approve, defer, or reject in Governance."
          : "Materialize to proposed update when ready.",
      priorityScore: 62 + (p.status === "new" ? 8 : 0),
      quickLinks: [
        { label: "Target wiki", href: `/wiki?path=${encodeURIComponent(t)}` },
        { label: "Canon promotions", href: "/canon-promotions" },
        { label: "Admission", href: "/canon-admission" },
      ],
    });
  }

  for (const w of watch?.rows ?? []) {
    if (!boardPaths.has(w.pagePath)) continue;
    push({
      id: `cc-watch-${w.pagePath}`,
      kind: "watchlist",
      path: w.pagePath,
      title: w.pagePath,
      canonicalState: `watch:${w.severity}`,
      warnings: w.reasons.slice(0, 5),
      trustSummary: w.links.join("; ") || "Canon drift watchlist row.",
      pendingActions: ["Snapshot before major edits", "Re-run operational refresh after changes"],
      recommendedNext: "Treat as fragile canon — review evidence + drift together.",
      priorityScore: w.severity === "high" ? 78 : 64,
      quickLinks: [
        { label: "Wiki", href: `/wiki?path=${encodeURIComponent(w.pagePath)}` },
        { label: "Watchlist", href: "/canon-watchlist" },
      ],
    });
  }

  for (const a of alerts.alerts) {
    if (a.status !== "new" && a.status !== "seen") continue;
    if (!boardPaths.has(a.pagePath)) continue;
    push({
      id: `cc-ev-${a.id}`,
      kind: "evidence_alert",
      path: a.pagePath,
      title: a.changeSummary.slice(0, 72),
      canonicalState: `evidence:${a.severity}`,
      warnings: [a.why],
      trustSummary: a.changeSummary,
      pendingActions: ["Acknowledge or dismiss alert", "Update page if assumptions shifted"],
      recommendedNext: "Compare current sources vs trace; update synthesis or mark alert reviewed.",
      priorityScore: a.severity === "high" ? 80 : 66,
      quickLinks: [
        { label: "Wiki", href: `/wiki?path=${encodeURIComponent(a.pagePath)}` },
        { label: "Governance", href: "/governance" },
      ],
    });
  }

  for (const x of xsig?.items ?? []) {
    if (!boardPaths.has(x.path)) continue;
    if ((x.dragonScore ?? 0) < 5) continue;
    push({
      id: `cc-xsig-${x.path}`,
      kind: "cross_signal",
      path: x.path,
      title: x.headline,
      canonicalState: "multi-signal",
      warnings: x.signals ?? [],
      trustSummary: `Dragon score ${x.dragonScore}`,
      pendingActions: ["Treat as council-prioritized: multiple risk signals"],
      recommendedNext: "Use review session or cross-signal page; snapshot if editing.",
      priorityScore: 70 + Math.min(20, x.dragonScore ?? 0),
      quickLinks: [
        { label: "Wiki", href: `/wiki?path=${encodeURIComponent(x.path)}` },
        { label: "Cross-signal", href: "/cross-signal" },
      ],
    });
  }

  const since = cutoffMs();
  for (const r of res.items) {
    const touched = Date.parse(r.resolvedAt);
    if (Number.isNaN(touched) || touched < since) continue;
    const canonTouch = r.relatedPagePaths.some((p) => boardPaths.has(p));
    if (!canonTouch) continue;
    push({
      id: `cc-res-${r.id}`,
      kind: "recent_resolution",
      path: r.relatedPagePaths[0] ?? "wiki/",
      title: r.issueSummary.slice(0, 80),
      canonicalState: "human_resolution",
      warnings: r.relatedPagePaths.filter((p) => boardPaths.has(p)),
      trustSummary: r.decision.slice(0, 180),
      pendingActions: r.followUp ? [r.followUp] : [],
      recommendedNext: "Verify canon pages still match resolution intent after any ingest.",
      priorityScore: 55,
      quickLinks: [
        { label: "Resolutions", href: "/resolutions" },
        { label: "Wiki", href: `/wiki?path=${encodeURIComponent(r.relatedPagePaths[0] ?? "wiki/INDEX.md")}` },
      ],
    });
  }

  items.sort((a, b) => b.priorityScore - a.priorityScore);
  const top = items.slice(0, 80);

  const file: CanonCouncilFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    headline:
      top.length === 0
        ? "Canon council clear — no high-priority canon rows this refresh."
        : `${top.length} high-signal canon / promotion / watch items need executive attention.`,
    items: top,
  };
  await writeCanonCouncil(paths, file);
  return file;
}

import fs from "node:fs/promises";
import path from "node:path";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { readCanonCouncil } from "./canon-council.js";
import { readReviewDebt } from "./review-debt.js";
import { readReviewPriority } from "../trust/review-priority.js";
import { readDecisionSunset } from "./decision-sunset.js";

export interface ReviewWorkloadPlanItem {
  path: string;
  title: string;
  estMinutes: number;
  why: string;
  order: number;
  impactHint: string;
}

export interface ReviewWorkloadPlan {
  label: "10min" | "30min" | "60min";
  items: ReviewWorkloadPlanItem[];
  preamble: string;
}

function uniqueByPath(items: { path: string; title: string; score: number; why: string }[], limit: number) {
  const seen = new Set<string>();
  const out: typeof items = [];
  for (const it of items.sort((a, b) => b.score - a.score)) {
    if (seen.has(it.path)) continue;
    seen.add(it.path);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Time-boxed review paths from existing signals — estimates are coarse hints only.
 */
export async function buildReviewWorkloadPlans(cfg: BrainConfig): Promise<{
  plans: ReviewWorkloadPlan[];
  debtLevel?: string;
}> {
  const paths = brainPaths(cfg.root);
  const council = await readCanonCouncil(paths);
  const debt = await readReviewDebt(paths);
  const pri = await readReviewPriority(paths);
  const sunset = await readDecisionSunset(paths);

  const pool: { path: string; title: string; score: number; why: string }[] = [];

  for (const it of council?.items ?? []) {
    pool.push({
      path: it.path,
      title: it.title,
      score: it.priorityScore,
      why: `${it.kind}: ${it.warnings[0] ?? it.recommendedNext}`,
    });
  }
  for (const r of (pri?.queue ?? []).slice(0, 25)) {
    pool.push({
      path: r.path,
      title: r.path,
      score: r.priority0to100,
      why: r.why[0] ?? r.bucket,
    });
  }
  for (const h of sunset?.hints ?? []) {
    if (h.status === "ignored" || h.status === "revalidated") continue;
    pool.push({
      path: h.decisionWikiPath,
      title: h.decisionTitle,
      score: 48 + Math.min(20, (h.ageDaysApprox ?? 0) / 30),
      why: `Sunset: ${h.whyFlagged[0] ?? "revisit"}`,
    });
  }

  const pick10 = uniqueByPath(pool, 4);
  const pick30 = uniqueByPath(pool, 10);
  const pick60 = uniqueByPath(pool, 18);

  const plans: ReviewWorkloadPlan[] = [
    {
      label: "10min",
      preamble: `Quick pass — ${debt?.level ?? "unknown"} debt. Focus on one canon or promotion row and exit.`,
      items: pick10.map((p, i) => ({
        path: p.path,
        title: p.title,
        estMinutes: 3,
        why: p.why,
        order: i + 1,
        impactHint: "Highest council / queue score in your window.",
      })),
    },
    {
      label: "30min",
      preamble: `Deeper pass — walk council + queue; add one sunset decision if time remains.`,
      items: pick30.map((p, i) => ({
        path: p.path,
        title: p.title,
        estMinutes: i < 4 ? 5 : 3,
        why: p.why,
        order: i + 1,
        impactHint: i < 3 ? "Dragon / canon row" : "Breadth across domains",
      })),
    },
    {
      label: "60min",
      preamble: `Optional deep clean — sequential session; pair with Review session mode for pacing.`,
      items: pick60.map((p, i) => ({
        path: p.path,
        title: p.title,
        estMinutes: i < 8 ? 4 : 3,
        why: p.why,
        order: i + 1,
        impactHint: "Broader debt reduction — stop when fatigue rises.",
      })),
    },
  ];

  return { plans, debtLevel: debt?.level };
}

export async function writeReviewWorkloadMarkdown(
  cfg: BrainConfig,
  plan: ReviewWorkloadPlan
): Promise<string> {
  const paths = brainPaths(cfg.root);
  const stamp = new Date().toISOString().replace(/:/g, "").replace(/\.\d{3}Z$/, "");
  const day = stamp.slice(0, 10);
  const fname =
    plan.label === "10min"
      ? `review-plan-10min-${day}-${stamp.slice(11)}.md`
      : plan.label === "30min"
        ? `review-plan-30min-${day}-${stamp.slice(11)}.md`
        : `review-plan-60min-${day}-${stamp.slice(11)}.md`;

  const lines = [
    "---",
    `title: Review plan (${plan.label})`,
    `kind: review-plan`,
    `generated: ${new Date().toISOString()}`,
    "---",
    "",
    plan.preamble,
    "",
    "## Ordered items",
    ...plan.items.map(
      (i) =>
        `### ${i.order}. ${i.title}\n- **Path:** \`${i.path}\`\n- **~${i.estMinutes} min** — ${i.why}\n- **Impact:** ${i.impactHint}\n`
    ),
    "",
  ];
  await fs.mkdir(paths.reviewsDir, { recursive: true });
  const rel = path.join("outputs", "reviews", fname);
  await fs.writeFile(path.join(cfg.root, rel), lines.join("\n"), "utf8");
  return rel.split(path.sep).join("/");
}

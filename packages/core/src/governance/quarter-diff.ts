import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";

interface SectionMap {
  [heading: string]: string[];
}

function stripMd(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSections(mdBody: string): SectionMap {
  const map: SectionMap = {};
  const lines = mdBody.split(/\r?\n/);
  let cur: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (cur) map[cur] = buf.map((l) => stripMd(l)).filter(Boolean);
  };
  for (const line of lines) {
    const hm = /^##\s+(.+)\s*$/.exec(line);
    if (hm) {
      flush();
      cur = hm[1]!.trim();
      buf = [];
    } else if (cur && /^\s*[-*]\s+/.test(line)) {
      buf.push(line);
    }
  }
  flush();
  return map;
}

/**
 * Strategic diff between two quarterly review markdown files (structure + bullets, not raw line diff).
 */
export async function generateQuarterOverQuarterDiff(
  cfg: BrainConfig,
  fromRel: string,
  toRel: string
): Promise<string> {
  const paths = brainPaths(cfg.root);
  const rootAbs = path.resolve(cfg.root);
  const absA = path.resolve(rootAbs, fromRel);
  const absB = path.resolve(rootAbs, toRel);
  const under = (abs: string) => {
    const rel = path.relative(rootAbs, abs);
    return rel !== "" && !rel.startsWith(`..${path.sep}`) && rel !== "..";
  };
  if (!under(absA) || !under(absB)) {
    throw new Error("Quarter diff paths must stay within brain root");
  }
  const rawA = await fs.readFile(absA, "utf8");
  const rawB = await fs.readFile(absB, "utf8");
  const { content: aBody, data: aFm } = matter(rawA);
  const { content: bBody, data: bFm } = matter(rawB);

  const A = extractSections(aBody);
  const B = extractSections(bBody);
  const headings = new Set([...Object.keys(A), ...Object.keys(B)]);

  const fromQ = (aFm as { quarter?: string }).quarter ?? fromRel;
  const toQ = (bFm as { quarter?: string }).quarter ?? toRel;

  const linesOut: string[] = [
    "---",
    "title: Quarter-over-quarter memory diff",
    "kind: qoq-diff",
    `from_quarter_file: ${fromRel}`,
    `to_quarter_file: ${toRel}`,
    `generated: ${new Date().toISOString()}`,
    "---",
    "",
    `_Advisory synthesis comparing **${fromQ}** → **${toQ}** — bullets are heuristically grouped, not machine-diffed._`,
    "",
    "## Executive read",
    `- Compared structured sections from two quarterly reviews on disk.`,
    `- Use this as a **narrative prompt**, then verify in the wiki / ledgers.`,
    "",
    "## Sections that grew",
  ];

  for (const h of headings) {
    const a = A[h] ?? [];
    const b = B[h] ?? [];
    if (b.length > a.length + 1) {
      linesOut.push(`### ${h}`, `- Was ~${a.length} bullets → now ~${b.length}.`);
      const added = b.filter((x) => !a.includes(x)).slice(0, 8);
      for (const x of added) linesOut.push(`  - _new emphasis:_ ${x.slice(0, 200)}`);
      linesOut.push("");
    }
  }

  linesOut.push("## Sections that shrank or disappeared");
  for (const h of headings) {
    const a = A[h] ?? [];
    const b = B[h] ?? [];
    if (a.length > b.length + 1 || (a.length > 0 && b.length === 0)) {
      linesOut.push(`### ${h}`, `- Was ~${a.length} bullets → now ~${b.length}.`);
      const lost = a.filter((x) => !b.includes(x)).slice(0, 8);
      for (const x of lost) linesOut.push(`  - _faded:_ ${x.slice(0, 200)}`);
      linesOut.push("");
    }
  }

  linesOut.push(
    "## Stable themes (overlap)",
    "Bullets appearing in both quarters (sample):",
    ""
  );
  let overlapCount = 0;
  for (const h of headings) {
    const inter = (A[h] ?? []).filter((x) => (B[h] ?? []).includes(x));
    for (const x of inter.slice(0, 4)) {
      linesOut.push(`- **${h}:** ${x.slice(0, 200)}`);
      overlapCount++;
      if (overlapCount >= 16) break;
    }
    if (overlapCount >= 16) break;
  }
  if (!overlapCount) linesOut.push("- _(little literal overlap — themes may have been rephrased)_");

  linesOut.push(
    "",
    "## Prompts",
    "- Which assumptions flipped between these two snapshots?",
    "- Did canon pages called out in the earlier quarter drift by the later quarter?",
    "- What open loops persisted across both files?",
    ""
  );

  await fs.mkdir(paths.reviewsDir, { recursive: true });
  const stamp = new Date().toISOString();
  const safeFrom = path.basename(fromRel, ".md").replace(/[^a-z0-9-]/gi, "-");
  const safeTo = path.basename(toRel, ".md").replace(/[^a-z0-9-]/gi, "-");
  const fname = `quarter-diff-${safeFrom}-vs-${safeTo}-${stamp.slice(0, 10)}-${stamp.slice(11, 19).replace(/:/g, "")}.md`;
  const rel = path.join("outputs", "reviews", fname);
  await fs.writeFile(path.join(cfg.root, rel), linesOut.join("\n"), "utf8");
  return rel.split(path.sep).join("/");
}

import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";

export type DecisionStatus =
  | "proposed"
  | "accepted"
  | "reversed"
  | "superseded"
  | "draft";

export interface DecisionLedgerEntry {
  id: string;
  title: string;
  date?: string;
  status: DecisionStatus;
  wikiPath: string;
  domain?: string;
  context?: string;
  decision?: string;
  rationale?: string;
  alternatives?: string[];
  consequences?: string;
  related?: string[];
  sources?: string[];
}

export interface DecisionLedgerFile {
  version: 1;
  updatedAt: string;
  decisions: DecisionLedgerEntry[];
}

const DECISION_SIGNAL =
  /^(decision|rationale|alternatives|consequences|status|reversal|adr|context)\s*:/im;

export function looksLikeDecisionMarkdown(content: string, title?: string): boolean {
  const t = (title ?? "").toLowerCase();
  if (/\badrs?\b|decision|\bmemo\b/i.test(t)) return true;
  return DECISION_SIGNAL.test(content) && /decided|we will|resolved|chosen/i.test(content);
}

export async function readDecisionLedger(paths: BrainPaths): Promise<DecisionLedgerFile> {
  try {
    const raw = await fs.readFile(paths.decisionLedgerJson, "utf8");
    return JSON.parse(raw) as DecisionLedgerFile;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), decisions: [] };
  }
}

export async function writeDecisionLedger(
  paths: BrainPaths,
  ledger: DecisionLedgerFile
): Promise<void> {
  await fs.mkdir(path.dirname(paths.decisionLedgerJson), { recursive: true });
  await fs.writeFile(
    paths.decisionLedgerJson,
    JSON.stringify({ ...ledger, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

function entryIdFromPath(rel: string): string {
  const withoutMd = rel.replace(/\.md$/i, "");
  const slug = withoutMd
    .replace(/^wiki\/?/i, "")
    .split(/[/\\]+/)
    .filter(Boolean)
    .join("-")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `dec-${slug || "entry"}`;
}

/**
 * Scan wiki/decisions and wiki/* for decision-shaped pages; refresh JSON + INDEX.md.
 */
export async function refreshDecisionLedger(cfg: BrainConfig): Promise<DecisionLedgerFile> {
  const paths = brainPaths(cfg.root);
  const pattern = path.join(paths.wiki, "**/*.md").replace(/\\/g, "/");
  const files = await fg(pattern, { onlyFiles: true });
  const decisions: DecisionLedgerEntry[] = [];

  for (const abs of files) {
    const rel = path.relative(cfg.root, abs).split(path.sep).join("/");
    if (!rel.startsWith("wiki/")) continue;
    const raw = await fs.readFile(abs, "utf8");
    const { content, data } = matter(raw);
    const fm = data as {
      title?: string;
      type?: string;
      domain?: string;
      status?: string;
      last_updated?: string;
      sources?: string[];
      decision?: string;
      context?: string;
      rationale?: string;
      alternatives?: string[];
      consequences?: string;
      related?: string[];
      /** When false, page stays out of ledger + INDEX until promoted (human-in-the-loop stubs). */
      include_in_ledger?: boolean;
    };
    if (fm.include_in_ledger === false) {
      continue;
    }
    const title = fm.title ?? path.basename(rel, ".md");
    const inDecisionsFolder = rel.startsWith("wiki/decisions/");
    const isDecisionType = fm.type === "decision" || fm.type === "adr";

    if (!inDecisionsFolder && !isDecisionType && !looksLikeDecisionMarkdown(content, title)) {
      continue;
    }

    let status: DecisionStatus = "draft";
    const st = (fm.status ?? "").toLowerCase();
    if (st.includes("reverse")) status = "reversed";
    else if (st.includes("supersede")) status = "superseded";
    else if (st.includes("accept") || st === "done" || st === "locked") status = "accepted";
    else if (st.includes("propos")) status = "proposed";

    const segments = rel.split("/").filter(Boolean);
    let domainFallback: string | undefined;
    if (segments.length > 1) {
      const seg = segments[1]!;
      if (seg && !seg.includes(".")) domainFallback = seg;
    }

    decisions.push({
      id: entryIdFromPath(rel),
      title,
      date: fm.last_updated,
      status,
      wikiPath: rel,
      domain: fm.domain ?? domainFallback,
      context: fm.context,
      decision: fm.decision ?? content.split("\n\n")[0]?.slice(0, 400),
      rationale: fm.rationale,
      alternatives: fm.alternatives,
      consequences: fm.consequences,
      related: fm.related,
      sources: fm.sources,
    });
  }

  decisions.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const ledger: DecisionLedgerFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    decisions,
  };
  await writeDecisionLedger(paths, ledger);

  const indexPath = path.join(paths.decisionsWikiDir, "INDEX.md");
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  const lines = [
    "# Decision ledger index",
    "",
    `_Machine-readable: \`.brain/decision-ledger.json\` · updated ${ledger.updatedAt.slice(0, 10)}_`,
    "",
    "## Recent decisions",
    "",
    ...decisions.slice(0, 80).map((d) => {
      return `- **[[${path.basename(d.wikiPath, ".md")}]]** (${d.status}) — ${d.title} — \`${d.wikiPath}\``;
    }),
    "",
  ];
  await fs.writeFile(indexPath, lines.join("\n"), "utf8");

  return ledger;
}

export function filterDecisions(
  ledger: DecisionLedgerFile,
  q: { status?: string; domain?: string; search?: string }
): DecisionLedgerEntry[] {
  let rows = ledger.decisions;
  if (q.status) rows = rows.filter((d) => d.status === q.status);
  if (q.domain) rows = rows.filter((d) => d.domain === q.domain);
  if (q.search) {
    const s = q.search.toLowerCase();
    rows = rows.filter(
      (d) =>
        d.title.toLowerCase().includes(s) ||
        (d.decision ?? "").toLowerCase().includes(s) ||
        d.wikiPath.toLowerCase().includes(s)
    );
  }
  return rows;
}

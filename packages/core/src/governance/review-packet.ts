import fs from "node:fs/promises";
import path from "node:path";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { readReviewPriority } from "../trust/review-priority.js";
import { readUnsupportedClaims } from "../trust/unsupported-claims.js";
import { readConflicts } from "../trust/conflicts.js";
import { readKnowledgeDrift } from "../trust/knowledge-drift.js";
import { readOpenLoops } from "../trust/open-loops.js";
import { readExecutiveSnapshot } from "../trust/executive-snapshot.js";
import { readCanonicalBoard } from "./canonical-board.js";
import { readCrossSignal } from "./cross-signal.js";

/** Bundled markdown for a focused 10–20 minute human review. */
export async function generateReviewPacket(cfg: BrainConfig): Promise<string> {
  const paths = brainPaths(cfg.root);
  const stamp = new Date();
  const tag = stamp.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const relOut = path.join("outputs", "reviews", `review-packet-${tag}.md`).split(path.sep).join("/");
  const absOut = path.join(cfg.root, relOut);

  const [queue, uns, conf, drift, loops, exec, board, dragons] = await Promise.all([
    readReviewPriority(paths),
    readUnsupportedClaims(paths),
    readConflicts(paths),
    readKnowledgeDrift(paths),
    readOpenLoops(paths),
    readExecutiveSnapshot(paths),
    readCanonicalBoard(paths),
    readCrossSignal(paths),
  ]);

  const openConf = conf.items.filter(
    (c) => c.status !== "resolved" && c.status !== "ignored" && c.status !== "accepted-as-tension"
  );
  const openDrift = drift.items.filter((d) => d.status !== "resolved" && d.status !== "ignored");
  const openUns = uns.items.filter((u) => u.status !== "resolved" && u.status !== "ignored");
  const hotLoops = loops.items
    .filter((l) => l.status === "open" && (l.priority === "high" || l.loopType === "decision"))
    .slice(0, 12);

  const lines: string[] = [
    "---",
    `title: Review packet`,
    `kind: review-packet`,
    `generated: ${stamp.toISOString()}`,
    "---",
    "",
    "## Summary",
    "",
    exec?.headline ?? "Run operational refresh for an executive headline.",
    "",
    "> Heuristic bundle — not a substitute for reading git diffs and sources.",
    "",
    "## Checklist",
    "",
    "- [ ] Top review-queue paths skimmed",
    "- [ ] Open conflicts glanced or triaged",
    "- [ ] Drift items with decision impact checked",
    "- [ ] Canonical board attention rows handled or scheduled",
    "- [ ] Cross-signal “dragons” opened if time permits",
    "",
    "## Review priority (top)",
    "",
    ...((): string[] => {
      const rows = queue?.queue ?? [];
      if (!rows.length) return ["- _(run refresh)_"];
      return rows.slice(0, 12).map((r) => {
        const why = r.why.slice(0, 4).join("; ");
        return `- **\`${r.path}\`** (${r.bucket}, ${r.priority0to100}) — ${why}`;
      });
    })(),
    "",
    "## Cross-signal correlation (dragons)",
    "",
    ...((): string[] => {
      const items = dragons?.items ?? [];
      if (!items.length) return ["- _(none)_"];
      return items.slice(0, 10).map(
        (d) =>
          `- **\`${d.path}\`** (score ${d.dragonScore}) — ${d.headline}: ${d.signals.slice(0, 4).join("; ")}`
      );
    })(),
    "",
    "## Canonical review board (attention)",
    "",
    ...((): string[] => {
      const items = (board?.items ?? [])
        .filter((i) => i.urgency === "attention")
        .slice(0, 10);
      if (!items.length) return ["- _(none)_"];
      return items.map(
        (i) =>
          `- **\`${i.path}\`** — ${i.warnings.slice(0, 3).join("; ") || i.lockLabel}`
      );
    })(),
    "",
    "## Unsupported claims (sample)",
    "",
    ...openUns.slice(0, 8).map((u) => `- \`${u.pagePath}\` — ${u.reason} (${u.severity})`),
    "",
    "## Conflicts (open)",
    "",
    ...openConf.slice(0, 6).map((c) => `- **${c.topic}** — \`${c.sourceA}\` vs \`${c.sourceB}\``),
    "",
    "## Drift (open)",
    "",
    ...openDrift.slice(0, 6).map((d) => `- \`${d.pagePath}\` — ${d.summary}`),
    "",
    "## High-priority open loops",
    "",
    ...hotLoops.map((l) => `- ${l.title} — \`${l.sourcePath}\``),
    "",
    "## Recommended next actions",
    "",
    "1. Open Review Priority queue in dashboard.",
    "2. Snapshot any canonical page before large edits (`brain snapshot <wiki-path>`).",
    "3. Log resolutions in Resolution Memory when you close items.",
    "",
  ];

  await fs.mkdir(path.dirname(absOut), { recursive: true });
  await fs.writeFile(absOut, lines.join("\n"), "utf8");
  return relOut;
}

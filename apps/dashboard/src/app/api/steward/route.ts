import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import {
  brainPaths,
  computeDomainCoverage,
  readReviewPriority,
  readOpenLoops,
  readConflicts,
  readKnowledgeDrift,
  readUnsupportedClaims,
  readCanonicalBoard,
  readCrossSignal,
} from "@second-brain/core";
import fg from "fast-glob";
import path from "node:path";

const KNOWN = new Set([
  "work",
  "health",
  "projects",
  "research",
  "decisions",
  "writing",
  "life",
  "goals",
  "people",
  "concepts",
  "systems",
  "topics",
]);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const domain = (searchParams.get("domain") ?? "work").toLowerCase();
    if (!KNOWN.has(domain)) {
      return NextResponse.json({ error: "unknown domain" }, { status: 400 });
    }
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const coverage = await computeDomainCoverage(cfg);
    const row = coverage.find((c) => c.domain === domain);
    const queue = await readReviewPriority(paths);
    const loops = await readOpenLoops(paths);
    const conflicts = await readConflicts(paths);
    const drift = await readKnowledgeDrift(paths);
    const uns = await readUnsupportedClaims(paths);
    const board = await readCanonicalBoard(paths);
    const dragons = await readCrossSignal(paths);

    const domainPages = (
      await fg(path.join(paths.wiki, domain, "**/*.md").replace(/\\/g, "/"), { onlyFiles: true })
    ).map((abs) => path.relative(cfg.root, abs).split(path.sep).join("/"));

    const filterPath = (p: string) => p.includes(`/${domain}/`) || p.startsWith(`wiki/${domain}/`);

    return NextResponse.json({
      domain,
      coverage: row ?? null,
      reviewQueue: queue?.queue.filter((q) => filterPath(q.path)).slice(0, 20) ?? [],
      openLoops: loops.items
        .filter((l) => l.status === "open" && (l.domain === domain || filterPath(l.sourcePath)))
        .slice(0, 15),
      conflicts: conflicts.items
        .filter(
          (c) =>
            c.status !== "resolved" &&
            c.status !== "ignored" &&
            (filterPath(c.sourceA) || filterPath(c.sourceB))
        )
        .slice(0, 10),
      drift: drift.items
        .filter((d) => d.status !== "resolved" && d.status !== "ignored" && filterPath(d.pagePath))
        .slice(0, 10),
      unsupported: uns.items
        .filter((u) => u.status !== "resolved" && u.status !== "ignored" && filterPath(u.pagePath))
        .slice(0, 12),
      canonicalBoard: board?.items.filter((i) => filterPath(i.path)).slice(0, 12) ?? [],
      crossSignal: dragons?.items.filter((d) => filterPath(d.path)).slice(0, 10) ?? [],
      wikiPagesInDomain: domainPages.slice(0, 80),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

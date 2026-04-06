import fs from "node:fs/promises";
import path from "node:path";
import type { BrainPaths } from "../paths.js";
import { readKnowledgeDrift } from "../trust/knowledge-drift.js";
import { readDecisionLedger } from "../trust/decision-ledger.js";

export type DriftDecisionElevation = "decision-page" | "linked-from-decision" | "decisions-folder";

export interface DriftDecisionLink {
  driftId: string;
  pagePath: string;
  driftSummary: string;
  decisionPaths: string[];
  elevation: DriftDecisionElevation;
  severity: "low" | "medium" | "high";
}

export interface DriftDecisionLinksFile {
  version: 1;
  updatedAt: string;
  links: DriftDecisionLink[];
}

export async function readDriftDecisionLinks(paths: BrainPaths): Promise<DriftDecisionLinksFile | null> {
  try {
    const raw = await fs.readFile(paths.driftDecisionLinksJson, "utf8");
    return JSON.parse(raw) as DriftDecisionLinksFile;
  } catch {
    return null;
  }
}

export async function writeDriftDecisionLinks(paths: BrainPaths, f: DriftDecisionLinksFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.driftDecisionLinksJson), { recursive: true });
  await fs.writeFile(
    paths.driftDecisionLinksJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

function relatesToPage(driftPath: string, related: string[] | undefined): boolean {
  if (!related?.length) return false;
  const base = driftPath.replace(/^wiki\//, "");
  for (const r of related) {
    const t = r.trim();
    if (!t) continue;
    if (t === driftPath || driftPath.endsWith(t) || t.endsWith(base)) return true;
    if (t.includes("/") && driftPath.includes(t.replace(/^\//, ""))) return true;
  }
  return false;
}

export async function buildDriftDecisionBridge(paths: BrainPaths): Promise<DriftDecisionLinksFile> {
  const drift = await readKnowledgeDrift(paths);
  const ledger = await readDecisionLedger(paths);
  const links: DriftDecisionLink[] = [];

  const openDrift = drift.items.filter(
    (d) => d.status === "new" || d.status === "reviewing"
  );

  for (const d of openDrift) {
    const decisionPaths = new Set<string>();
    let elevation: DriftDecisionElevation | null = null;

    if (d.pagePath.startsWith("wiki/decisions/")) {
      elevation = "decisions-folder";
      decisionPaths.add(d.pagePath);
    }

    for (const dec of ledger.decisions) {
      if (dec.wikiPath === d.pagePath) {
        decisionPaths.add(dec.wikiPath);
        elevation = elevation ?? "decision-page";
      } else if (relatesToPage(d.pagePath, dec.related)) {
        decisionPaths.add(dec.wikiPath);
        elevation = "linked-from-decision";
      }
    }

    if (decisionPaths.size === 0) continue;

    const sev: DriftDecisionLink["severity"] =
      d.severity === "high" || decisionPaths.size > 1 ? "high" : d.severity === "medium" ? "medium" : "low";

    links.push({
      driftId: d.id,
      pagePath: d.pagePath,
      driftSummary: d.summary,
      decisionPaths: [...decisionPaths],
      elevation: elevation ?? "linked-from-decision",
      severity: sev,
    });
  }

  links.sort((a, b) => {
    const rank = (s: DriftDecisionLink["severity"]) =>
      s === "high" ? 0 : s === "medium" ? 1 : 2;
    return rank(a.severity) - rank(b.severity);
  });

  const file: DriftDecisionLinksFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    links: links.slice(0, 120),
  };
  await writeDriftDecisionLinks(paths, file);
  return file;
}

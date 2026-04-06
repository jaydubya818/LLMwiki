import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import type { BrainPaths } from "../paths.js";

export type ClaimSupportKind = "direct" | "synthesized" | "weak";

export interface TraceSourceRef {
  path: string;
  lastIngestedAt?: string;
}

export interface WikiSectionTrace {
  id: string;
  heading: string;
  anchor: string;
  support: ClaimSupportKind;
  confidenceHint?: "high" | "medium" | "low";
  sources: TraceSourceRef[];
  relatedWiki: string[];
  notes?: string;
}

export interface WikiClaimTraceFile {
  version: 1;
  wikiPath: string;
  updatedAt: string;
  sections: WikiSectionTrace[];
}

function safeTraceFileName(wikiRel: string): string {
  const h = crypto.createHash("sha256").update(wikiRel).digest("hex").slice(0, 16);
  const base = path.basename(wikiRel, ".md").replace(/[^a-z0-9-_]/gi, "-").slice(0, 40);
  return `${base}-${h}.json`;
}

export function wikiTraceSidecarPath(paths: BrainPaths, wikiRel: string): string {
  return path.join(paths.traceDir, safeTraceFileName(wikiRel));
}

/** Parse ## headings from markdown body (no frontmatter). */
export function extractSectionHeadings(body: string): string[] {
  return parseSectionsWithOptionalTraceMarkers(body).map((s) => s.heading);
}

export interface ParsedTraceSection {
  heading: string;
  /** From `<!-- trace:sec-id -->` on the preceding line (optional). */
  traceId?: string;
}

/**
 * Split on `##` headings; if a line matches `<!-- trace:my-id -->` immediately before a heading,
 * that section's trace `id` uses `my-id` when building claim-trace sidecars on ingest.
 */
export function parseSectionsWithOptionalTraceMarkers(body: string): ParsedTraceSection[] {
  const lines = body.split(/\n/);
  const sections: ParsedTraceSection[] = [];
  let pendingTraceId: string | undefined;

  for (const line of lines) {
    const t = line.trim();
    const traceM = /^<!--\s*trace:([a-zA-Z0-9][a-zA-Z0-9_-]*)\s*-->$/i.exec(t);
    if (traceM) {
      pendingTraceId = traceM[1];
      continue;
    }
    const hm = /^##\s+(.+)$/.exec(t);
    if (hm) {
      sections.push({ heading: hm[1]!.trim(), traceId: pendingTraceId });
      pendingTraceId = undefined;
    }
  }
  return sections;
}

function slugAnchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

/**
 * Build paragraph/section-level trace from ingest context.
 * Prefer useful provenance over fake precision: one bundle of sources per section.
 */
export function buildSectionTracesFromIngest(params: {
  wikiRel: string;
  markdownBody: string;
  sourcesThisRun: string[];
  ingestCacheTimes: Record<string, string | undefined>;
}): WikiSectionTrace[] {
  const parsed = parseSectionsWithOptionalTraceMarkers(params.markdownBody);
  const defaultParsed: ParsedTraceSection[] =
    parsed.length > 0
      ? parsed
      : ["Summary", "Key points", "Related", "Sources", "Latest synthesis"].map((heading) => ({
          heading,
        }));
  const srcRefs: TraceSourceRef[] = params.sourcesThisRun.map((p) => ({
    path: p,
    lastIngestedAt: params.ingestCacheTimes[p],
  }));
  const multi = params.sourcesThisRun.length > 1;
  return defaultParsed.map((sec, i) => {
    const anchor = slugAnchor(sec.heading);
    const id = sec.traceId ?? `sec-${i}-${anchor}`;
    const support: ClaimSupportKind = multi ? "synthesized" : "direct";
    return {
      id,
      heading: sec.heading,
      anchor,
      support,
      // Placeholder: multi-source traces still default to medium confidence until richer heuristics land.
      confidenceHint: "medium",
      sources: srcRefs,
      relatedWiki: [],
      notes:
        sec.traceId
          ? "Section id from <!-- trace:... --> marker; stable across ingest when you keep the marker."
          : support === "synthesized"
            ? "Merged from multiple raw sources this run; treat as synthesis, not verbatim."
            : undefined,
    };
  });
}

export async function writeWikiTrace(
  paths: BrainPaths,
  trace: WikiClaimTraceFile
): Promise<void> {
  await fs.mkdir(paths.traceDir, { recursive: true });
  const file = wikiTraceSidecarPath(paths, trace.wikiPath);
  await fs.writeFile(file, JSON.stringify(trace, null, 2), "utf8");
}

export async function readWikiTrace(
  paths: BrainPaths,
  wikiRel: string
): Promise<WikiClaimTraceFile | null> {
  try {
    const file = wikiTraceSidecarPath(paths, wikiRel);
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as WikiClaimTraceFile;
  } catch {
    return null;
  }
}

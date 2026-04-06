import type { IngestLlmPlan } from "./types.js";
import { slugifyWikiName } from "../wiki/wikilinks.js";

export function heuristicIngestPlan(
  relativePath: string,
  text: string
): IngestLlmPlan {
  const firstLine =
    text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "Untitled source";
  const title = firstLine.replace(/^#\s*/, "").slice(0, 80);
  const slug = slugifyWikiName(title) || slugifyWikiName(relativePath);
  const summary =
    text.slice(0, 600).replace(/\s+/g, " ").trim() +
    (text.length > 600 ? "…" : "");
  const domain = guessDomainFromPath(relativePath);
  return {
    summary,
    entities: [],
    primaryDomain: domain,
    suggestedPages: [
      {
        domain,
        slug,
        title,
        executiveSummary: summary,
        relatedLinks: [],
        keyPoints: extractBullets(text).slice(0, 5),
      },
    ],
    indexLines: [`- [[${slug}]] — synthesized from \`${relativePath}\``],
    dashboardBullets: [`Source ingested: \`${relativePath}\` → [[${slug}]]`],
  };
}

function guessDomainFromPath(rel: string): IngestLlmPlan["primaryDomain"] {
  const lower = rel.toLowerCase();
  if (lower.includes("meeting")) return "work";
  if (lower.includes("research")) return "research";
  if (lower.includes("journal")) return "life";
  if (lower.includes("bookmark")) return "topics";
  if (lower.includes("article")) return "research";
  if (lower.includes("note")) return "topics";
  if (lower.includes("people") || lower.includes("stakeholder")) return "people";
  if (lower.includes("project")) return "projects";
  return "topics";
}

function extractBullets(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const bullets: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^[-*]\s+/.test(t)) bullets.push(t.replace(/^[-*]\s+/, "").slice(0, 200));
    if (/^\d+\.\s+/.test(t)) bullets.push(t.replace(/^\d+\.\s+/, "").slice(0, 200));
    if (bullets.length >= 8) break;
  }
  return bullets;
}

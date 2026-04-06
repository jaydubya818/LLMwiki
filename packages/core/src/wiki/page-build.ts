import matter from "gray-matter";
import { slugifyWikiName } from "./wikilinks.js";

export interface WikiPagePayload {
  title: string;
  type: string;
  domain: string;
  executiveSummary: string;
  keyPoints: string[];
  relatedLinks: string[];
  sources: string[];
  tags?: string[];
}

export function buildWikiPageMarkdown(
  payload: WikiPagePayload,
  bodyExtra?: string
): string {
  const today = new Date().toISOString().slice(0, 10);
  const fm = {
    title: payload.title,
    type: payload.type,
    domain: payload.domain,
    status: "active",
    tags: payload.tags ?? [],
    last_updated: today,
    sources: payload.sources,
  };
  const links =
    payload.relatedLinks.length > 0
      ? payload.relatedLinks.map((l) => `- [[${l}]]`).join("\n")
      : "_None yet._";
  const keys =
    payload.keyPoints.length > 0
      ? payload.keyPoints.map((k) => `- ${k}`).join("\n")
      : "_No key points extracted._";
  const sources =
    payload.sources.length > 0
      ? payload.sources.map((s) => `- \`${s}\``).join("\n")
      : "_No sources linked._";

  const core = `${payload.executiveSummary}

## Key points
${keys}

## Related
${links}

## Sources
${sources}

${
  bodyExtra
    ? `## Notes\n${bodyExtra}\n`
    : ""
}`;
  return matter.stringify(core, fm);
}

export function stableSlugFromTitle(title: string): string {
  return slugifyWikiName(title);
}

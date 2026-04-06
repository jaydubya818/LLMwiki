import type { SearchIndex, SearchDocKind } from "./indexer.js";

export interface SearchFilters {
  kinds?: SearchDocKind[];
  folderPrefix?: string;
  entityType?: string;
  after?: Date;
  before?: Date;
}

export interface SearchHit {
  path: string;
  kind: SearchDocKind;
  score: number;
  preview: string;
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9_]+/i)
    .filter((t) => t.length >= 2);
}

export function searchIndex(
  index: SearchIndex,
  query: string,
  filters?: SearchFilters,
  limit = 40
): SearchHit[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const boosts: Record<SearchDocKind, number> = {
    wiki: 3,
    output: 1.5,
    raw: 1,
  };

  const hits: SearchHit[] = [];

  for (const doc of index.docs) {
    if (filters?.kinds && !filters.kinds.includes(doc.kind)) continue;
    if (filters?.folderPrefix && !doc.path.startsWith(filters.folderPrefix)) {
      continue;
    }
    if (filters?.after && doc.mtimeMs < filters.after.getTime()) continue;
    if (filters?.before && doc.mtimeMs > filters.before.getTime()) continue;
    if (filters?.entityType && !doc.text.includes(`type: ${filters.entityType}`)) {
      /* optional frontmatter filter - soft */
    }

    const lower = doc.text.toLowerCase();
    let score = 0;
    for (const t of terms) {
      const c = countOccurrences(lower, t);
      score += c * boosts[doc.kind];
      if (doc.path.toLowerCase().includes(t)) score += 4 * boosts[doc.kind];
    }
    if (score <= 0) continue;
    hits.push({
      path: doc.path,
      kind: doc.kind,
      score,
      preview: makePreview(doc.text, terms),
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

function makePreview(text: string, terms: string[]): string {
  const lower = text.toLowerCase();
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0) {
      const start = Math.max(0, i - 80);
      return text.slice(start, start + 220).replace(/\s+/g, " ").trim();
    }
  }
  return text.slice(0, 200).replace(/\s+/g, " ");
}

/**
 * Canonical / lock semantics for wiki pages (frontmatter-driven).
 * Ingest respects these flags so durable pages are not silently overwritten.
 */

export type WikiEditPolicy = "open" | "manual_review" | "locked";

export function parseWikiEditPolicy(
  fm: Record<string, unknown>
): WikiEditPolicy {
  const raw = fm.wiki_edit_policy;
  if (raw === "locked" || raw === "manual_review" || raw === "open") {
    return raw;
  }
  const canonical = fm.canonical;
  if (canonical === true || canonical === "true" || canonical === "yes") {
    return "manual_review";
  }
  return "open";
}

export function blocksAutoIngestMerge(policy: WikiEditPolicy): boolean {
  return policy === "locked" || policy === "manual_review";
}

export function lockBadgeLabel(policy: WikiEditPolicy): string {
  switch (policy) {
    case "locked":
      return "Locked";
    case "manual_review":
      return "Manual review";
    default:
      return "Open";
  }
}

import type { BrainPaths } from "../paths.js";
import { listRuns } from "../runs.js";

/**
 * Suggest a git commit message from the most recent ingest run, if any.
 */
export async function suggestWikiCommitMessage(
  paths: BrainPaths
): Promise<string> {
  const runs = await listRuns(paths, 40);
  const ingest = runs.find((r) => r.kind === "ingest");
  const fromDetails =
    typeof ingest?.details?.suggestedCommitMessage === "string"
      ? (ingest.details.suggestedCommitMessage as string)
      : null;
  if (fromDetails?.trim()) return fromDetails.trim();
  const s = typeof ingest?.summary === "string" ? ingest.summary.trim() : "";
  if (s) return `wiki: ${s}`;
  const day = new Date().toISOString().slice(0, 10);
  return `wiki: update ${day}`;
}

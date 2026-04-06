import type { BrainPaths } from "../paths.js";
import { listRuns } from "../runs.js";

export interface SuggestCommitContext {
  message: string;
  ingestStartedAt?: string;
  ingestFinishedAt?: string;
  ingestId?: string;
}

/**
 * Suggested message plus ingest metadata for staleness checks in the diff UI.
 */
export async function suggestWikiCommitWithContext(
  paths: BrainPaths
): Promise<SuggestCommitContext> {
  const runs = await listRuns(paths, 40);
  const ingest = runs.find((r) => r.kind === "ingest");
  const fromDetails =
    typeof ingest?.details?.suggestedCommitMessage === "string"
      ? (ingest.details.suggestedCommitMessage as string)
      : null;
  let message: string;
  if (fromDetails?.trim()) message = fromDetails.trim();
  else {
    const s = typeof ingest?.summary === "string" ? ingest.summary.trim() : "";
    if (s) message = `wiki: ${s}`;
    else {
      const day = new Date().toISOString().slice(0, 10);
      message = `wiki: update ${day}`;
    }
  }
  return {
    message,
    ingestStartedAt: ingest?.startedAt,
    ingestFinishedAt: ingest?.finishedAt,
    ingestId: ingest?.id,
  };
}

/**
 * Suggest a git commit message from the most recent ingest run, if any.
 */
export async function suggestWikiCommitMessage(
  paths: BrainPaths
): Promise<string> {
  const { message } = await suggestWikiCommitWithContext(paths);
  return message;
}

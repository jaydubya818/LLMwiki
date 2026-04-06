# Trust boundary and extension seams (v1)

**Git commits on `wiki/` are the trust boundary.** Ingest, lint, and LLM output are **proposals** until you review and commit.

## Stable seams (extend without re-architecture)

1. **Review state** — `.brain/review-state.json` holds per-path approve/reject/clear for the dashboard. A future incremental staging UI can read/write the same shape or a superset.

2. **Diff enrichment** — `diff-enrichment.ts` (and related helpers) is the place to attach **inferred source run**, **mtime**, **domain grouping**, and later **confidence** or **provenance** hints. Keep enrichment **pure** (no network); callers stay in CLI/dashboard.

3. **Suggested commit** — `suggestWikiCommitWithContext` centralizes message generation from last ingest / run metadata. Stale detection (`isSuggestedCommitContextStale`) compares timestamps so the UI can warn when newer activity happened after the suggestion.

4. **Approve / commit** — `applyReviewDecisions` and dashboard APIs accept an optional **`commitMessage`**. Future templates (e.g. per-domain prefixes) belong next to suggest-commit, not scattered in the UI.

## Operational intelligence (v2, single-brain)

Heuristic scanners and aggregators live beside this file (`unsupported-claims`, `conflicts`, `knowledge-drift`, `open-loops`, `page-quality`, `review-priority`, `synthesis-heatmap`, `source-lineage`, `relationship-hub`, `executive-snapshot`), orchestrated by `refresh-operational.ts`. Outputs are `.brain/*.json` plus optional `wiki/relationship-hub.md`. Interpretation guardrails and the file manifest are in the **repo root `README.md`** (section *Operational intelligence (v2)*).

## Explicit non-goals for v1

- No cloud vector DB or mandatory remote inference.
- No OCR, voice diarization, or full timeline/relationship graph in core — only hooks and docs so those can plug in later.

# Recommended v2+ enhancements (not commitments)

This document lists **possible** directions for Second Brain / LLM Wiki after the v1 trust-and-ops baseline. Nothing here is a promise or scheduled work; it exists to avoid painting the codebase into a corner and to give a shared vocabulary for future design.

## Seed list (from v1 planning)

- **Local semantic ranker** (lightweight embeddings) on top of the file index, still local-first.
- **Merge suggestions** for near-duplicate wiki pages (lexical + optional local embeddings later).
- **Confidence / provenance** annotations per claim (page- or block-level metadata, not full knowledge graphs in v1).
- **OCR pipeline** for `raw/screenshots/` (optional local models or Tesseract-class stacks).
- **Voice note ingest** and automatic diarization for `raw/transcripts/`.
- **MOC (map-of-content) generator** per domain with automated `INDEX` sections.
- **Relationship map** for people ↔ projects ↔ decisions (lightweight entity + edge store or derived markdown).
- **Timeline view** for decisions and outputs (from frontmatter + run logs).
- **Focus mode**: filter dashboard + search by domain / tag.
- **Prompt library sync** between `wiki/prompts/` and versioned `.brain/prompts/`.
- **Incremental git staging** UI with messages derived from run summaries (beyond single “approve batch” commits).

## A. Trust / quality

- **Claim-level source linking** (each claim points at `raw/` or external URL).
- **Unsupported-claim review queue** surfaced in dashboard.
- **Duplicate-page detection score** (lexical Jaccard + heading overlap first).
- **Page quality score** (structure, links, staleness heuristics).
- **Stale-page score** vs `last_updated` and incoming link churn.
- **Source freshness indicators** when upstream raw files change.
- **Conflict-resolution workflow** for contradictory pages (side-by-side + resolution log).

## B. Workflow / operating model

- **Daily digest** from recent wiki deltas (CLI or markdown in `outputs/`).
- **Weekly executive summary** export (email is optional; file-first default).
- **“Next best question”** suggestions from open loops and thin pages.
- **Project open-loops tracker** (from tasks/decisions frontmatter).
- **Recurring review templates** (checklists per domain).
- **Capture inbox triage** workflow for `raw/inbox/`.
- **Review reminders** based on staleness or domain schedules.

## C. Knowledge UX

- **Stronger backlink panels** in wiki view and Obsidian-friendly mirrors.
- **Map-of-content pages** by domain (generated + hand-curated).
- **Relationship hub pages** for people and projects.
- **Better entity extraction** during ingest (names, dates, decisions) with human confirm.
- **Cross-page comparison** view (two paths, unified structure diff).
- **Source-to-wiki trace** view (raw hash → wiki section).
- **Domain heatmap / coverage** visualization (which folders are thin or stale).

## D. Search / retrieval

- **Hybrid lexical + semantic** search (local embeddings, no cloud requirement).
- **Saved searches** and pinned queries.
- **Related pages** recommendations from links + co-occurrence + future semantic neighbors.
- **Query history** (local only).
- **Search result clustering** by topic/domain.
- **Timeline-aware search** filters (e.g. decisions after date X).

## E. Media / input

- **PDF table extraction** improvements beyond plain text.
- **Image metadata** extraction and attachment indexing.
- **Screenshot OCR + figure summaries** (ties to OCR pipeline).
- **Meeting recording ingest** (bulk files under `raw/` with transcripts folder convention).
- **Browser clipper** conventions (Markdown drops into `raw/`).
- **Email export ingest** (mbox → `raw/`).
- **Slack/export import** adapters (file-first, no Slack API dependency required).

## F. Outputs / publishing

- **Slide deck generation** from wiki topics.
- **Daily briefing** generation (markdown/audio optional).
- **Audio briefing** from the same pipelines as video scripts.
- **Publish to markdown packages** or static export (Quartz-style, etc.).
- **Decision memo generator** from tagged pages.
- **Learning roadmap generator** from goals + existing notes.

## G. Safety / resilience / ops

- **Backup/export guide** (documented restore paths).
- **Optional encrypted archive** workflow for sensitive vaults.
- **Brain doctor extensions** (new checks as features land).
- **Vault repair tools** (regenerate indexes, fix canonical paths).
- **Broken-link fixer** (wiki + outputs).
- **Orphan-page repair** suggestions (merge, redirect wikilinks, or archive).
- **Run replay / audit trail** improvements (who approved what, which ingest produced a line).

## Extension points in v1 code (intentional seams)

- **Diff file list**: enrichment in `packages/core` (`diff-enrichment` / review metadata) can gain fields (provenance, confidence) without changing git’s role as trust boundary.
- **Suggested commit**: `suggestWikiCommitWithContext` can incorporate richer run summaries; UI stays a thin editor over that string.
- **Review state**: `.brain/review-state.json` remains the source of truth for dashboard decisions until commit; future “staging UI” can layer on without replacing it.

For the **operator-facing** description of the current review flow, see the root **README** (Dashboard diff review & weekly rhythm).

/**
 * Production vault templates for `brain init` (single-brain operational vault).
 * These are intentionally detailed so the vault is usable on day one.
 */

export const PRODUCTION_CLAUDE_MD = `# Second Brain — operating schema

This file is the **contract** between you, your tools, and any AI assistant working in this vault. Read it before large structural changes.

## Purpose

This brain is your **local-first operating memory**: capture in \`raw/\`, synthesize in \`wiki/\`, ship artifacts from \`outputs/\`, and **never** trust wiki changes you have not reviewed in git.

It is optimized for:

- **Work leadership** — clarity, delegation, stakeholder narrative  
- **Projects** — status, risks, decisions, next steps  
- **Architecture** — systems, boundaries, interfaces, evolution  
- **AI systems** — prompts, evals, tool boundaries, safety  
- **Research** — papers, concepts, comparisons, open questions  
- **Writing** — drafts, outlines, published vs working notes  
- **Goals** — outcomes, metrics, quarterly focus  
- **Health** — durable facts and plans (not transient logs)  
- **Life systems** — habits, finances, home, logistics  
- **Decisions** — context, options, call, reversibility  
- **Learning** — curricula, skill maps, spaced themes  
- **People & relationships** — respectful, useful context only  

---

## Folder roles

| Path | Role | Mutability |
|------|------|------------|
| \`raw/\` | **Immutable capture** — inbox, articles, notes, meetings, transcripts, exports | You edit; AI does **not** overwrite source files |
| \`wiki/\` | **Synthesized knowledge** — linked, updated pages for reuse | AI may propose changes; **you approve via git** |
| \`outputs/\` | **Generated briefs, reports, health checks, reviews** — experimental | Promote winners into \`wiki/\` when they become canonical |
| \`videos/\` | Scripts + \`daily_videos.md\` log | Append-only log; scripts editable |
| \`assets/\` | Images, diagrams referenced from markdown | You manage |
| \`.brain/\` | Indexes, caches, runs, review state — **operational** | Safe to delete caches; not canonical knowledge |

---

## Ingest rules

1. **Inputs** only from \`raw/\` (supported: md, txt, json, csv, pdf, common text types per extractor).  
2. **Idempotency**: content hashed; unchanged files skipped unless \`--force\`.  
3. **Outputs**: new/updated pages under \`wiki/<domain>/\`, updates to \`wiki/INDEX.md\` catalog marker and \`wiki/dashboard.md\` activity marker.  
4. After ingest, **always** inspect \`brain diff\` before commit.  
5. **Never** treat ingest as infallible — it proposes structure; you correct in wiki or re-ingest after fixing \`raw/\`.

---

## Wiki rules

- **Domains** match folder names: \`topics\`, \`projects\`, \`people\`, \`decisions\`, \`concepts\`, \`systems\`, \`research\`, \`health\`, \`goals\`, \`writing\`, \`prompts\`, \`weekly-reviews\`, \`life\`, \`work\`, etc.  
- **Stable slugs**: kebab-case filenames; avoid dated filenames for evergreen pages (use frontmatter for dates).  
- **Executive summary**: first meaningful block should stand alone (Obsidian reading).  
- **Wikilinks**: \`[[Page-Title]]\` / \`[[slug]]\` — prefer links to orphan pages.  
- **Sources**: frontmatter \`sources:\` lists \`raw/...\` paths that justified the page.  
- **INDEX.md**: high-level map; don’t hand-edit the catalog block between markers — ingest maintains it inside the marked section.  
- **dashboard.md**: operational pulse; activity section is ingest-maintained between markers.

---

## Page standards (frontmatter)

Use YAML frontmatter on wiki pages:

\`\`\`yaml
title: "Human-readable title"
type: topic | project | person | decision | concept | system | note
domain: topics
last_updated: YYYY-MM-DD
sources:
  - raw/inbox/example.md
tags: []
\`\`\`

Body: \`# Title\`, short summary, sections, \`## Sources\` when claims are non-obvious.

---

## Naming conventions

- **Wiki files**: \`kebab-case.md\`  
- **Projects**: \`wiki/projects/<slug>.md\`  
- **People**: respectful, minimal sensitive detail; no speculation stated as fact  
- **Outputs**: tool-generated names include date and topic slug — browse \`outputs/\` by folder  

---

## Output rules (\`outputs/\`)

- **briefs/**, **reports/**, **comparisons/**, **plans/**, **reviews/**, **health-checks/**, **presentations/**  
- Outputs are **working artifacts**. When an output becomes **canonical**, either:
  - merge key conclusions into the right \`wiki/\` page, or  
  - create a new wiki page and link from dashboard/index.  
- **Promotion**: high-value outputs deserve a wiki home; low-value outputs can stay in \`outputs/\` until superseded.

---

## Lint / health-check rules

- Run \`brain lint\` **weekly** (or after big merges).  
- Findings go to \`outputs/health-checks/\` and the run log.  
- Treat \`error\` and serious \`warn\` as blockers before declaring the wiki “clean.”  
- Orphans and unresolved wikilinks are **signal**, not noise — schedule fixes.

---

## Dashboard expectations

- \`wiki/dashboard.md\` is the **operator view**: what moved, what’s hot, what’s uncertain.  
- The local web dashboard surfaces: **last operations**, **pending git review**, **suggested weekly steps**.  
- Prefer a **weekly rhythm**: ingest → review → lint → approve → (optional) executive review.

---

## Git review expectations (trust boundary)

1. **Wiki is reviewed content**. Uncommitted wiki changes are **untrusted** until you scan the diff.  
2. Use **per-file approve/reject** in the dashboard Diff UI (stored in \`.brain/review-state.json\`) or review the raw diff in the terminal.  
3. **Rejected** paths are reverted from last commit for that path — verify with \`brain diff\` again.  
4. **Approved** paths are staged and committed with a **meaningful message** (ingest suggests one from the last run when possible).  
5. **Commit often** after review batches; don’t let unreviewed wiki drift for days.

---

## Daily video rules

- Scripts land in \`videos/scripts/YYYY-MM-DD.md\`.  
- ~**150 words**, first person, grounded in a real wiki page; avoid repeating the same topic within **7 days** where possible.  
- **HeyGen** (optional): requires \`HEYGEN_API_KEY\`. The API shape may change — if render fails, the **script is still the primary deliverable**.  
- \`videos/daily_videos.md\` logs script summary + video URL or “not configured / failed”.

---

## MCP / automation

- MCP tools are **scoped to this brain** unless you configure otherwise.  
- Prefer **read/search** before **run_ingest** from an agent; don’t auto-commit.

---

## Long-term philosophy

- **Trust but verify**: synthesis accelerates you; git keeps you honest.  
- **Bias to links**: a connected wiki beats a pile of pages.  
- **Small loops**: frequent ingest + short review beats rare hero sessions.  
- **Your CLAUDE.md wins**: edit this file as your practice evolves; keep rules explicit.

---

*Generated by \`brain init\` — customize freely.*
`;

export const VAULT_README = `# Your Second Brain vault

This folder is your **operational vault**: markdown on disk, Obsidian-friendly, with \`brain\` (CLI) + dashboard for ingest, search, graph, and git-backed review.

## First-run checklist

1. **Set environment** — \`export SECOND_BRAIN_ROOT=\` this directory (add to your shell profile or use \`-r\` on CLI commands). Optionally set \`SECOND_BRAIN_VAULT_NAME\` to your Obsidian vault name (Settings → About) so dashboard/wiki **Open in Obsidian** links target the correct library; you can also set \`obsidianVaultName\` in \`.brain/settings.json\`.
2. **Personalize \`CLAUDE.md\`** — adjust domains, tone, and rules to match how *you* work.
3. **Add raw material** — drop notes, exports, or drafts into \`raw/inbox/\` (or other \`raw/\` subfolders).
4. **Run ingest** — \`brain ingest\` (from the monorepo or linked CLI). This updates \`wiki/\`, indexes, and graph.
5. **Run diff** — \`brain diff\` or open **Diff** in the dashboard. Read every changed wiki path.
6. **Approve changes** — use Diff UI (approve/reject) then \`brain approve\`, or \`brain approve --all -m "your message"\` if you reviewed the full patch.
7. **Open dashboard** — \`brain dashboard\` then visit the printed URL for status, search, and wiki.
8. **Weekly cadence** — ingest → executive review (\`brain review\`) → lint (\`brain lint\`) → approve commits → optional \`brain video\`.

If something feels off before a weekly cycle, run \`brain doctor\` for a local health report (writes \`outputs/reports/doctor-*.md\` and \`.brain/last-doctor.json\` unless you pass \`--no-save\`). The **Home** dashboard reads \`last-doctor.json\` for a fast readiness summary; the **Doctor** page can show that cache or a fresh in-browser run.

## Layout (quick ref)

- \`raw/\` — your immutable inputs  
- \`wiki/\` — synthesized, linked knowledge  
- \`outputs/\` — generated reports, health checks, weekly reviews  
- \`.brain/\` — indexes, run history, \`review-state.json\` for diff approvals, \`last-doctor.json\` after \`brain doctor\` (dashboard readiness)  
- \`CLAUDE.md\` — operating schema for you and AI assistants  

## Monorepo tooling

The **Second Brain** CLI and dashboard live in the git repo where you installed the tool. This vault can live **anywhere** on disk; point \`SECOND_BRAIN_ROOT\` here.

## Need help?

See the **repository README** for env vars, MCP setup, troubleshooting, and the recommended weekly command list.
`;

export const STARTER_INDEX_MD = `# Wiki index

<!-- BRAIN_CATALOG_START -->
_Catalog updates here after your first \`brain ingest\`._
<!-- BRAIN_CATALOG_END -->

## How to use this index

- **Domains** below map to \`wiki/<domain>/\` folders.  
- Prefer **one page per concept** with updates over duplicate pages.  
- Start navigation from **[[dashboard]]** (\`wiki/dashboard.md\`) for the operator view.

## Domains

| Domain | Intent |
|--------|--------|
| **topics** | Evergreen themes, mental models |
| **projects** | Active work with status and risks |
| **people** | Relationships and collaboration context |
| **decisions** | ADRs and calls (with reversibility) |
| **concepts** | Definitions and frameworks |
| **systems** | Life and work systems you maintain |
| **research** | Literature and synthesis |
| **health** | Long-horizon health notes |
| **goals** | Outcomes and quarterly focus |
| **writing** | Drafts and publishing pipeline |
| **prompts** | Reusable AI prompts |
| **weekly-reviews** | Cadence snapshots |
| **life** / **work** | Broad buckets as needed |

## Starter pages

- [[operating-cadence]] — suggested weekly rhythm  
- [[work-leadership-focus]] — placeholder for leadership themes  
- [[goals-current-quarter]] — placeholder for current goals  

`;

export const STARTER_DASHBOARD_MD = `# Dashboard

Living command center. Ingest updates the **Recent activity** block between the markers below.

<!-- BRAIN_ACTIVITY_START -->
_No activity yet — run \`brain ingest\` after adding sources to \`raw/\`._
<!-- BRAIN_ACTIVITY_END -->

## Priority topics

- What deserves synthesis this week?  
- Which project has the highest risk of silent drift?  

## Unresolved gaps

- Pages you know are missing links or sources  
- Open questions for the next weekly review  

## Suggested next actions

1. Add or refresh material under \`raw/inbox/\`  
2. \`brain ingest\`  
3. Review **Diff** → approve → commit  
4. \`brain review\` for executive weekly notes  
5. \`brain lint\` before end of week  

`;

export const RAW_GETTING_STARTED = `# Getting started (raw)

This note lives in \`raw/inbox/\`. It is **source material**, not the wiki.

**Next steps:**

1. Keep this file or delete it after you read it — either is fine.  
2. Add your own notes, PDFs, or exports under \`raw/\`.  
3. Run \`brain ingest\` from your terminal (with \`SECOND_BRAIN_ROOT\` set to this vault).  
4. Open \`wiki/dashboard.md\` and \`wiki/INDEX.md\` after ingest to see what was synthesized.  

The trust rule: **review git diffs** for \`wiki/\` before you commit.

`;

export const WIKI_OPERATING_CADENCE = `---
title: Operating cadence
type: topic
domain: topics
last_updated: ${new Date().toISOString().slice(0, 10)}
sources:
  - raw/inbox/getting-started.md
tags: [cadence, ops]
---

# Operating cadence

## Weekly rhythm (recommended)

| When | Action |
|------|--------|
| **Capture** | Ad hoc: drop files into \`raw/inbox/\` or topical folders |
| **1×/week** | \`brain ingest\` |
| **After ingest** | Dashboard **Diff** or \`brain diff\` — approve/reject, then \`brain approve\` |
| **Same week** | \`brain review\` (executive markdown to \`outputs/reviews/\`) |
| **Same week** | \`brain lint\` — read \`outputs/health-checks/\` |
| **Optional** | \`brain video\` for a short script + optional HeyGen render |

## Trust boundary

Uncommitted changes under \`wiki/\` are **provisional**. Commits are your statement that the synthesis is acceptable.

## Related

- [[dashboard]]  
- [[goals-current-quarter]]  
`;

export const WIKI_LEADERSHIP_FOCUS = `---
title: Work leadership focus
type: topic
domain: work
last_updated: ${new Date().toISOString().slice(0, 10)}
tags: [leadership, work]
---

# Work leadership focus

_Use this page for durable leadership context: team priorities, stakeholder map, your own operating rules for the season._

## Team / org snapshot

- 

## Decisions you owe others

- 

## What “good” looks like this quarter

- 

## Related

- [[operating-cadence]]  
- [[decisions-placeholder]]  
`;

export const WIKI_GOALS_QUARTER = `---
title: Goals — current quarter
type: topic
domain: goals
last_updated: ${new Date().toISOString().slice(0, 10)}
tags: [goals]
---

# Goals — current quarter

## Outcomes (3–5 max)

1. 
2. 

## Measures

| Goal | Signal | Target |
|------|--------|--------|

## Not doing this quarter

- 

## Related

- [[operating-cadence]]  
`;

export const WIKI_DECISIONS_PLACEHOLDER = `---
title: Decision template placeholder
type: decision
domain: decisions
last_updated: ${new Date().toISOString().slice(0, 10)}
tags: [template]
---

# Decision: [short title]

## Context

## Options

| Option | Upside | Downside |
|--------|--------|----------|

## Decision

## Reversibility

## Related

- [[operating-cadence]]  
`;

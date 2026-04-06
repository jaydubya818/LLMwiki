# Second Brain AI — Local LLM Wiki

A **local-first** personal knowledge OS: immutable `raw/` sources are compiled into an **AI-maintained markdown wiki**, with a **premium dashboard**, **git diff review**, **full-text search**, a **knowledge graph**, optional **HeyGen** video, and an **MCP server** for other agents.

- **Canonical storage**: Markdown + folders (Obsidian-friendly).
- **Trust boundary**: Git diffs on `wiki/` before commit.
- **No vector DB** and **no cloud backend** in v1.
- **v2 trust pass**: claim trace sidecars (`.brain/trace/`), local **promotion inbox** (`.brain/promotion-inbox.json`), **coverage gaps** + **domain scorecards**, **decision ledger** (`.brain/decision-ledger.json` + `wiki/decisions/INDEX.md`), **freshness heuristics**, **run replay** fields on `.brain/runs/*.json`, **canonical page locks** via `wiki_edit_policy` / `canonical` frontmatter (ingest proposes `.brain/proposed-wiki-updates/` instead of silent merge), **comparative synthesis**, and **prompt-to-output lineage** (`.brain/lineage/*.json` + `lineage_id` in outputs).
- **v2 operational intelligence** (single-brain): file-backed review queues and explainability signals — **unsupported claim queue**, **conflict resolver**, **page quality** (score + reasons), **source→wiki trace** (`.brain/source-lineage.json`), **knowledge drift** watchlist, **open loops** scraper, **relationship hub** markdown (`wiki/relationship-hub.md` + optional folder INDEXes), **executive snapshot**, **synthesis coverage heatmap**, and **review priority queue**. Refresh via dashboard **Operations** or `brain operational` / `brain operational refresh`. Interpret as **triage hints**, not automated truth.
- **v2/v3 governance pass** (single-brain): **canon promotion workflow** (`.brain/canon-promotions.json` + proposals only), **review SLA hints** (`.brain/review-sla.json`), **decision impact map**, **steward digests** + **quarterly reviews** under `outputs/reviews/`, **evidence change alerts**, **snapshot bundles**, **resolution quality** heuristics, **canon drift watchlist**, **review session mode**, and **`GET/POST /api/governance`**. Refreshed as part of **`brain lint`** and **`brain operational refresh`**. See **`docs/GOVERNANCE.md`** for cadence and philosophy.
- **Trust & curation v2** (single-brain, same refresh chain): **canonical review board** (`.brain/canonical-board.json`), **resolution memory** (`.brain/resolutions.json`), **evidence density** (`.brain/evidence-density.json`), **drift→decision bridge** (`.brain/drift-decision-links.json`), **domain steward** (`/steward`, digest markdown), **human-review index** (`.brain/human-review.json` + frontmatter), **source supersession** (`.brain/source-supersession.json`), **review packet** (`outputs/reviews/review-packet-*.md`), snapshots (**`brain snapshot`** / existing bundle machinery), and **cross-signal correlation** (`.brain/cross-signal-correlation.json`). Dashboard: **`/canonical-board`**, **`/resolutions`**, **`/cross-signal`**, **`/steward`**. Details and interpretation limits in **`docs/GOVERNANCE.md`** § *Trust & curation v2*.
- **Executive curation pass** (single-brain, end of operational refresh): **canon council** (`.brain/canon-council.json`), **review debt** (`.brain/review-debt.json`), **QoQ diff** (`outputs/reviews/quarter-diff-*.md`), **decision sunset** (`.brain/decision-sunset.json`), **strategic themes** (`.brain/strategic-themes.json` + optional `wiki/work/strategic-themes.md`), **confidence history** (`.brain/confidence-history.json`), **human overrides** (`.brain/human-overrides.json`), **canon admission** (`.brain/canon-admission.json`), **review plans** (`outputs/reviews/review-plan-*.md`), **annual review** (`outputs/reviews/annual-review-*.md`). Dashboard: **`/canon-council`**, **`/decision-sunset`**, **`/strategic-themes`**, **`/qoq-diff`**, **`/human-overrides`**, **`/canon-admission`**, plus Home / Executive / wiki confidence panel. See **`docs/GOVERNANCE.md`** for cadence and CLI (`brain canon-council`, `brain review-debt`, `brain qoq-diff`, `brain annual-review`, `brain review-plan`, `brain overrides`, …).
- **Governance intent capture** (single-brain, dashboard): key review actions also append **`.brain/human-overrides.json`**, **`governance-action-log.json`**, optional **council minutes** (`outputs/reviews/canon-council-minutes-*.md` / rolling log), **snapshot guard** on canon promotion materialize — tunable via **`.brain/governance-settings.json`** (see **`governance-settings.example.json`**). Details: **`docs/GOVERNANCE.md`** § *Human intent capture and audit trail*.

## Repository layout

| Path | Role |
|------|------|
| `packages/core` | Domain logic: ingest, graph, search, lint, git helpers, LLM adapters |
| `packages/cli` | `brain` CLI |
| `packages/mcp` | stdio MCP server |
| `apps/dashboard` | Next.js operator UI |

Your **personal brain** can live in a separate folder (created by `brain init`), for example `~/second-brain/` with `raw/`, `wiki/`, `outputs/`, `.brain/`, `CLAUDE.md`, etc.

**Multi-brain mode** keeps a **master** personal brain plus **isolated agent brains** under one workspace: `brains/master/`, `brains/agents/<name>/`, with `.workspace/registry.json`, `active-brain.json`, and `settings.json`. Git operates at the **workspace root** so wiki paths look like `brains/master/wiki/...`. Nothing is copied into master unless you run an explicit **promotion** (CLI or dashboard).

## Prerequisites

- Node.js **20+**
- `git` on PATH
- Optional: `OPENAI_API_KEY` for LLM-backed ingest, ask, lint (contradiction pass), outputs, and video scripts

## Install

```bash
cd "/path/to/My LLM Wiki"   # this monorepo
npm install
npm run build
```

Link the CLI (pick one):

```bash
npm link -w @second-brain/cli
# or use: node packages/cli/dist/index.js
```

## Quick start

```bash
brain init --target ~/second-brain   # prints a first-run checklist
export SECOND_BRAIN_ROOT=~/second-brain
brain compile
brain ingest
brain diff                            # trust: review every path
brain dashboard                       # Diff UI + weekly workflow
```

Your vault’s **`README.md`** repeats the checklist (env → `CLAUDE.md` → raw → ingest → diff → approve → dashboard → weekly cadence).

In another terminal (same repo):

```bash
export SECOND_BRAIN_ROOT=$HOME/second-brain
npm run dev -w @second-brain/dashboard
```

Open `http://localhost:3847` (or the port you set).

### Multi-brain quick start

```bash
cd /path/to/your-workspace   # one git repo for the whole tree
brain workspace init
brain create master
brain create agent coding-agent --template coding-agent
brain use master
export SECOND_BRAIN_WORKSPACE=/path/to/your-workspace
export SECOND_BRAIN_NAME=master
brain ingest
brain dashboard
```

- **Workspace view**: dashboard `/workspace` lists brains, recent runs, and promotion alerts.
- **Promotion center**: `/promotions` or `brain promote-review <agent>` then `brain promote <source> <target> <path>`.
- **Cross-brain summary**: `brain sync-summary` or the workspace page button (uses `OPENAI_API_KEY` when set).
- **Opt-in global search**: dashboard Search → “All brains”, or `brain search-all "query"`.

**Practices:** keep master for durable decisions and life/work systems; use agent brains for repo-specific or task-noisy work; promote only after review; treat master commits that include `promoted-*.md` as curated imports.

## Environment variables

Set in the brain folder’s `.env` (created by `init`) and/or the shell:

| Variable | Purpose |
|----------|---------|
| `SECOND_BRAIN_ROOT` | Absolute path to a single brain directory (**legacy**; use workspace mode for multi-brain) |
| `SECOND_BRAIN_WORKSPACE` | Absolute path to the workspace root (contains `brains/` and `.workspace/`) |
| `SECOND_BRAIN_NAME` | Logical brain to use inside the workspace (defaults to `active-brain.json`) |
| `SECOND_BRAIN_VAULT_NAME` | Exact Obsidian vault name for `obsidian://` links (optional). If unset: `obsidianVaultName` in `<vault>/.brain/settings.json`, else the vault folder basename, else fallback `SecondBrain`. |
| `OPENAI_API_KEY` | OpenAI-compatible ingest / Q&A / lint / outputs |
| `OPENAI_BASE_URL` | Default `https://api.openai.com/v1` |
| `OPENAI_MODEL` | Default `gpt-4o-mini` |
| `HEYGEN_API_KEY` | Optional video render (`brain video`) |
| `HEYGEN_API_BASE` | Default `https://api.heygen.com/v2` |
| `DASHBOARD_PORT` | Default `3847` |

Without `OPENAI_API_KEY`, ingest uses **heuristic** extraction (still updates wiki and indexes).

## CLI

| Command | Description |
|---------|-------------|
| `brain workspace init` | Create `brains/`, `.workspace/` metadata |
| `brain create master` | Ensure master brain dirs + registry |
| `brain create agent <name> --template <type>` | New agent brain (`coding-agent`, `strategy-agent`, `research-agent`, `leadership-agent`) |
| `brain list` / `brain use <name>` / `brain status` | Registry + active brain |
| `brain promote …` / `brain promote-review …` / `brain sync-summary` | Curated promotion + overview |
| `brain candidate …` | Mark a file as promotion candidate |
| `brain search-all "q"` | Search every brain (workspace only) |
| `brain doctor [--json] [--no-save]` | Vault health diagnostic (pass/warn/fail); **with save** (default): writes `outputs/reports/doctor-*.md` and **`.brain/last-doctor.json`** for the dashboard. **`--no-save`**: skips both the markdown report and the cache file. |
| `brain canon-guard [--json] [--no-save] [--staged-only \| --unstaged-only] [--hook] [wiki paths…]` | Warn when canon/locked wiki paths change in git without recent snapshots or governance trail; writes **`.brain/last-canon-guard.json`** (unless **`--no-save`**). **`--hook`**: pre-commit mode — respects **`canonGuardHookWarnOnly`** in governance settings. See **`docs/GOVERNANCE.md`**. |
| `brain install-hooks` | Install **`pre-commit`** to run **`brain canon-guard --hook`** (warn-only by default). |
| `brain init [--target dir]` | Legacy: scaffold a **standalone** brain folder + git init |
| `brain ingest [--force]` | Scan `raw/`, update wiki, INDEX/dashboard markers, hashes, graph, search index, `log.md` |
| `brain compile` | Rebuild `graph.json` + `search-index.json` |
| `brain ask "…" [--promote]` | Answer from wiki context → `outputs/reports/` |
| `brain review` | Executive weekly markdown → `outputs/reviews/` |
| `brain lint` | Health report → `outputs/health-checks/`; then **operational + governance JSON** refresh (trust queues, SLA, watchlist, etc.) |
| `brain video` | Daily script + `videos/daily_videos.md`; HeyGen if configured |
| `brain graph` | Rebuild graph only |
| `brain diff` | Show `git diff` for `wiki/` |
| `brain approve [--all] [-m msg]` | Commit approved paths from review state, or all wiki |
| `brain output <kind> "<topic>"` | `brief`, `compare`, `project-summary`, `research`, etc. |
| `brain compare <wiki-path…>` | Comparative synthesis → `outputs/comparisons/` (optional `--inbox`) |
| `brain operational` / `brain operational refresh` | Rebuild operational JSON **and governance artifacts** (same chain as end of `brain lint`) |
| `brain governance-refresh` | Same as `brain operational refresh` (explicit alias for governance-focused workflows) |
| `brain steward-digest [--domain <n> \| --all]` | Domain briefing markdown → `outputs/reviews/steward-digest-*.md` |
| `brain quarterly-review` | Quarterly reflective report → `outputs/reviews/quarterly-review-*.md` |
| `brain review-session [--rebuild]` | Show or rebuild `.brain/review-session-state.json` queue |
| `brain canonical-board` | TSV rows from `.brain/canonical-board.json` (after refresh) |
| `brain canon-council` | TSV rows from `.brain/canon-council.json` (after refresh) |
| `brain review-debt` | Print review debt summary |
| `brain decision-sunset` | TSV decision sunset hints |
| `brain qoq-diff --from <md> --to <md>` | Write `outputs/reviews/quarter-diff-*.md` |
| `brain annual-review` | Write `outputs/reviews/annual-review-*.md` |
| `brain review-plan [--minutes 10\|30\|60] [--write]` | Print/save time-boxed review plan markdown |
| `brain overrides [--limit n]` | Human override journal |
| `brain resolutions [--open <id>]` | List or print one resolution-memory record |
| `brain correlations` | Print cross-signal “dragon” rows |
| `brain review-packet` | Write `outputs/reviews/review-packet-*.md` (queues + board + correlations) |
| `brain snapshot <wiki/path.md> [-m reason]` | Dated copy under `outputs/reviews/snapshots/` |
| `brain steward [--domain <n> \| --all]` | Steward digest alias (same artifact as `steward-digest`) |
| `brain decision-draft <raw-or-output-path> [--write] [--slug hint]` | Preview or write a `wiki/decisions/` stub with `include_in_ledger: false` until promoted |
| `brain unsupported` | List `.brain/unsupported-claims.json` (`--status`, `--open <id>` for one row) |
| `brain runs` / `brain run <id>` | List runs or print one record (replay JSON) |
| `brain dashboard` | Dev server for the dashboard app |
| `brain mcp` | Spawn MCP server (stdio) |

Global options: `brain -r /path/to/brain <command>` (single brain), `brain -w /workspace <command>` and `brain -b <name> <command>` (multi-brain).

## Dashboard

- **Home**: trust banner, **readiness (doctor, cached)** from **`.brain/last-doctor.json`** (no full doctor re-run on each refresh), plus staleness/trust hints vs current git/state; Obsidian vault name hint; weekly workflow; metrics and actions as before; quick links to trust tools  
- **Operations** (`/operations`): hub for **Refresh operational intelligence** + links to **Executive** (`/executive`), **Review priority** (`/review-queue`), **Canonical board** (`/canonical-board`), **Cross-signal** (`/cross-signal`), **Resolutions** (`/resolutions`), **Steward** (`/steward`), **Unsupported claims** (`/unsupported-claims`), **Conflicts** (`/conflicts`), **Drift** (`/drift`), **Open loops** (`/open-loops`), **Source trace** (`/source-trace` + supersession hints when refreshed), **Heatmap** (`/heatmap`), **Relationships** (`/relationships`)
- **Trust hub** (`/trust`): map of explainability / curation features  
- **Governance** (`/governance`): hub — refresh trust+governance, steward digest & quarterly actions; **Canon promotions** (`/canon-promotions`), **Review session** (`/review-session`), **Canon drift watchlist** (`/canon-watchlist`), **Decision impact** (`/decision-impact`); **`/api/governance`** aggregates JSON + POST actions  
- **Doctor** (`/doctor`): default **cached** snapshot from `last-doctor.json`; **Run fresh check** calls the live doctor API (does not update the cache from the browser — run `brain doctor` in the CLI to refresh the cache)  
- **Workspace / Promotions** (multi-brain only): registry-level overview when `SECOND_BRAIN_WORKSPACE` is set  
- **Promotion inbox** (`/promotion-inbox`): single-brain staging (**`.brain/promotion-inbox.json`**)  
- **Coverage & scorecards** (`/coverage`): capture-vs-synthesis heuristics + domain bands  
- **Decision ledger** (`/decisions`): filter/search; **Refresh index** rebuilds JSON + `wiki/decisions/INDEX.md`  
- **Comparative synthesis** (`/compare`)  
- **Run replay** (`/replay?id=<uuid>`)  
- **Search**: full-text over wiki / raw / outputs; optional “All brains” in workspace mode; wiki hits show a **freshness** pill (first N matches) and a **Wiki + trace panel** deep link
- **Decision draft** (`/decision-draft`): preview then write a `wiki/decisions/` stub from `raw/` or `outputs/`; stubs use **`include_in_ledger: false`** until you flip frontmatter and refresh the ledger  
- **Wiki**: sidebar file tree, rendered markdown, wikilinks, Obsidian URI using `SECOND_BRAIN_VAULT_NAME` / `.brain/settings.json` / folder basename / `SecondBrain` fallback; **freshness** panel, **page quality** panel (bucket + “why” from `.brain/page-quality.json` after refresh), **canonical guard** from frontmatter, **claim trace** when `.brain/trace/` sidecar exists  
- **Graph**: `@xyflow/react` view; orphan / hub emphasis  
- **Diff** (`/diff`): polished review for pending `wiki/` changes — grouped file list, status/decision badges, optional **side-by-side** (HEAD vs working tree), **next/previous** and **jump to next undecided**, keyboard shortcuts (`j`/`k` move file, `n` next undecided, `?` help), **deep link** `?file=<repo-relative-path>`, metadata (path, mtime, inferred source hint), trust copy per file, and **activity** hints (recent ingest / lint / review vs your review state). **Commit message** field prefilled from **`suggestWikiCommitWithContext`** with **reset to suggested** and stale-message warning when ingest/review is newer than the suggestion context.
- **Runs / Video**: run JSON history (replay links) and daily video panel  

### Trust & explainability (v2)

| Feature | What it does | What it is *not* |
|--------|----------------|-------------------|
| **Claim trace** | `.brain/trace/*.json` maps **headings/sections** to raw paths + ingest timestamps; wiki UI summarizes *direct* vs *synthesized* support. Optional `<!-- trace:sec-id -->` immediately before a `##` heading gives a **stable section id** on ingest. | Not sentence-level certainty or automatic fact-checking. |
| **Promotion inbox** | Holds candidate artifacts before they become canonical wiki prose; promotions append with provenance frontmatter. | Not auto-merge into master in multi-brain mode (still use `/promotions` + `brain promote`). |
| **Coverage gaps / scorecards** | File-tree + ingest-cache heuristics flag domains where raw/outbox volume may outpace wiki depth. | Not semantic “missing topic” detection. |
| **Decision ledger** | Indexes decision-like wiki pages into **`.brain/decision-ledger.json`** + `wiki/decisions/INDEX.md` when you **Refresh**. | Not autonomous extraction from all prose (keeps noise low). |
| **Freshness badges** | Compares `last_updated`, listed `sources`, and ingest cache timestamps. | **Not** truth — a recency signal only. |
| **Run replay** | Runs store optional `changedFiles`, `inputsConsidered`, `trustNotes`, `lineageIds`. | Not a full git event log — brain-local audit JSON. |
| **Canonical lock** | `wiki_edit_policy: manual_review \| locked` (or `canonical: true`) stops **silent ingest merge**; proposals go to **`.brain/proposed-wiki-updates/`**. | Does not block human edits in Obsidian. |
| **Comparative synthesis** | Structured compare of 2–4 wiki paths → `outputs/comparisons/`. | Not a substitute for reading sources. |
| **Lineage** | `.brain/lineage/*.json` + `lineage_id` on outputs links prompts / retrieval / runs. | Not cryptographic proof — use git for audit. |

### Operational intelligence (v2)

Local JSON under `.brain/` powers dashboard views and CLI lists. **Strengths:** surfaces weak provenance, stale synthesis, linked tensions, and “what to review next” without a database. **Limits:** heuristics can miss real issues or flag noise; scores are **not** epistemic confidence; drift and conflicts mean **“worth a human look”**, not “wrong.”

| State file | Feature |
|------------|---------|
| `.brain/unsupported-claims.json` | Queue of pages/sections likely under-supported (few sources, decision-ish language, trace gaps). |
| `.brain/conflicts.json` | Structured tensions (e.g. opposing status polarity across linked wiki pages). |
| `.brain/page-quality.json` | Per-page score 0–100 + `reasons[]` + bucket (`high` / `medium` / `low`). |
| `.brain/source-lineage.json` | Raw path → wiki pages, outputs, decisions that cite it in frontmatter `sources`. |
| `.brain/knowledge-drift.json` | Wiki stale vs newer raw/domain activity — “likely needs review.” |
| `.brain/open-loops.json` | Questions, TODOs, follow-ups scraped from wiki and outputs. |
| `wiki/relationship-hub.md` (+ optional `wiki/people/INDEX.md`, `wiki/projects/INDEX.md`) | Readable people/project/decision hubs from `graph.json`. |
| `.brain/executive-snapshot.json` | Condensed headline view for Executive mode. |
| `.brain/synthesis-heatmap.json` | Domain-level gap/coverage matrix for prioritizing synthesis work. |
| `.brain/review-priority.json` | Ordered “review first” queue with explanations. |
| `.brain/canonical-board.json` | High-trust page control room (canon, locks, proposals, combined warnings). |
| `.brain/resolutions.json` | Durable notes when conflicts / drift / unsupported items are closed. |
| `.brain/evidence-density.json` | Per-page support depth (sources, trace, buckets — not “truth”). |
| `.brain/drift-decision-links.json` | Drift items that may affect decisions (ledger / `wiki/decisions/` / links). |
| `.brain/human-review.json` | Human-reviewed vs AI-maintained badges (synced with frontmatter). |
| `.brain/source-supersession.json` | Suggested newer/older raw pairs (conservative filename heuristics). |
| `.brain/cross-signal-correlation.json` | Pages where multiple trust signals overlap (“dragons”). |
| `.brain/canon-council.json` | Executive slice: canon promotions, hot board rows, watch-on-canon, evidence alerts. |
| `.brain/review-debt.json` | Review backlog pressure (level, contributors, short history). |
| `.brain/decision-sunset.json` | Hints to revalidate aging or stressed decisions. |
| `.brain/strategic-themes.json` | Heuristic recurring themes across loops / decisions / queue. |
| `.brain/confidence-history.json` | Rolling per-page advisory composite snapshots (trends). |
| `.brain/human-overrides.json` | Deliberate human divergences from AI / system suggestions. |
| `.brain/canon-admission.json` | Checklist pass/warn/fail for canon / promotion targets. |

### Diff review & commit (dashboard)

The safest mental model: **nothing is canon until it is committed to git.**

1. **Ingest** proposes edits under `wiki/` (and updates indexes).  
2. Open **`/diff`**. Pending files appear in the left list (undecided items highlighted). Use **Jump to first undecided** or **`n`** for the next undecided file.  
3. For each file, read the diff (unified or side-by-side). Choose **Approve**, **Reject**, or **Clear**. Decisions are stored in **`.brain/review-state.json`** and shown as badges immediately.  
4. Edit the **commit message** if you want; use **Reset to suggested** to pull the latest auto-generated summary. Empty messages are blocked before commit.  
5. Actions at the bottom: **Save decisions only** (writes review state, no git commit), **Commit approved changes** (commits only approved paths with your message; rejected paths are restored from `HEAD` for those files), or **Approve all pending + commit** (with confirmation).  
6. After a commit or batch of decisions, **refresh** the diff list. From the CLI you can still run **`brain approve`** / **`brain approve --all`** as before.

**Why this improves trust:** you see **exactly** what will enter history, file by file, with an explicit message. Git remains the **audit trail**; the dashboard is a **structured reviewer** on top of it.

### Weekly rhythm (single-brain)

Recommended order: **ingest → diff / review → commit → review → lint** (then optional `brain ask`, outputs, or video).

### Dashboard env

Run `brain dashboard` (sets `SECOND_BRAIN_ROOT` or workspace env for the child process) **or** export the same variables and `npm run dev -w @second-brain/dashboard`.

## Git workflow (trust boundary)

**Uncommitted `wiki/` changes are provisional.** Ingest only *proposes* updates; you decide what becomes history.

1. Run `brain ingest` (or dashboard **Ingest**).  
2. Inspect **`brain diff`** or the dashboard **`/diff`** page — read the full patch per file (see **Diff review & commit** above).  
3. Mark each path **Approve** / **Reject** / **Clear** in the UI (stored under `.brain/review-state.json`), or review locally and use the CLI only.  
4. Commit **approved** paths: use the dashboard **Commit approved changes** (with your edited message) or **`brain approve`** / **`brain approve -m "…"`**. Rejected paths are restored from `HEAD` for that file.  
5. For a **full** wiki commit after you’ve reviewed everything outside the UI: `brain approve --all -m "…"`. Without `-m`, the CLI suggests a message from the latest ingest run when possible.

Rejected paths use `git checkout -- <repo-relative-path>` — always re-run **Diff** after a batch of decisions.

## Recommended operational usage

Before your **weekly** ingest → diff → approve cycle, if anything feels wrong (env, git, indexes, Obsidian links), run **`brain doctor`** and fix any FAIL lines first. **Home** reads the latest **`brain doctor`** snapshot from `.brain/last-doctor.json` so the page stays fast; if Home shows **stale readiness** (old snapshot, or activity after the last doctor run), run **`brain doctor`** again (omit `--no-save`). After **initial setup** or **env/config changes**, run doctor once to prime the cache.

**Stale doctor** on the dashboard means the saved snapshot is older than ~48h and/or likely predates a recent ingest, lint, review, or extra pending wiki paths — not that the vault is necessarily broken. Re-run **`brain doctor`** when you want an up-to-date pass/fail list written to disk and cache.

| Horizon | What to do |
|---------|------------|
| **Daily / ad hoc** | Drop notes, exports, or drafts into `raw/inbox/` (or topical `raw/` folders). |
| **Weekly** | `brain ingest` → **Diff** / approve → `brain approve` → `brain review` → `brain lint`. |
| **Monthly** | Skim latest `outputs/health-checks/`, fix orphans and stale `last_updated`, optional `brain compile` after bulk manual edits. |
| **Optional** | `brain video` for script + log; HeyGen render if configured (see below). |

### Normal weekly cycle (exact commands)

Run from a shell with `SECOND_BRAIN_ROOT` set (or `brain -r /path/to/vault …`):

```bash
brain ingest
brain operational       # or: brain operational refresh — rebuild trust/ops JSON
brain diff              # or use the dashboard Diff page
# Mark approve/reject in dashboard, then:
brain approve
brain review
brain lint
```

Optional: `brain ask "…"` for a focused answer, `brain video` for a daily script.

## HeyGen / video

- Integration lives in **`packages/core/src/video/heygen-client.ts`**. The REST paths and JSON shape are **best-effort**; HeyGen may change their API — if renders fail, check the **`[heygen]`** lines in stderr and your dashboard/log tail; the **markdown script is always written** regardless.  
- Set `HEYGEN_API_KEY` and optionally `HEYGEN_API_BASE` (default `https://api.heygen.com/v2`).  
- Confirm current API docs: [HeyGen API documentation](https://docs.heygen.com/) when debugging.

## Troubleshooting

| Symptom | What to try |
|---------|-------------|
| Dashboard env / status errors | Export `SECOND_BRAIN_ROOT` or workspace vars, or run `brain dashboard`. Run **`brain doctor`** for a structured checklist. |
| Missing vault layout or core files | Restore `raw/`, `wiki/`, `outputs/`, `videos/`, `.brain/` or re-run **`brain init`** into a fresh folder. **`brain doctor`** lists missing paths. |
| No `git` or no `.git` | Install Git; **`git init`** at vault root (legacy) or workspace root (multi-brain). |
| Missing search index / graph / `state.json` | Run **`brain ingest`** or **`brain compile`**. **`brain doctor`** flags stale or missing generated files. |
| Obsidian link opens wrong vault | Set **`SECOND_BRAIN_VAULT_NAME`** or **`obsidianVaultName`** in `.brain/settings.json` to match Obsidian **Settings → About** vault name. |
| HeyGen errors | Optional integration — scripts still write without **`HEYGEN_API_KEY`**; **`brain doctor`** summarizes video readiness. |
| Ingest skips files | New content only (hash match). Use `brain ingest --force` once. |
| Diff empty but wiki “changed” | Ensure you’re in the same git repo as the vault; workspace mode uses repo-relative paths under `brains/.../wiki/`. |
| Approve says nothing to commit | Mark paths **Approve** in Diff UI first, or use `brain approve --all` after manual review. |
| Search empty | Run `brain ingest` or `brain compile` to rebuild `.brain/search-index.json`. |
| HeyGen always fails | Script still in `videos/scripts/`; verify API key, base URL, and response shape against HeyGen docs. |

## MCP (Cursor, Claude Desktop, etc.)

stdio server:

```json
{
  "mcpServers": {
    "second-brain": {
      "command": "node",
      "args": ["/absolute/path/to/My LLM Wiki/packages/mcp/dist/index.js"],
      "env": {
        "SECOND_BRAIN_ROOT": "/absolute/path/to/your-vault"
      }
    }
  }
}
```

For multi-brain, use `SECOND_BRAIN_WORKSPACE` + `SECOND_BRAIN_NAME` instead of `SECOND_BRAIN_ROOT`.

Or run `brain mcp` from an environment with those variables set.

**Tools**: `search_brain`, `read_page`, `list_wiki_pages`, `graph_neighbors`, `recent_changes`, `run_ingest`, `run_lint`, `generate_output`, `daily_video_script`, `rebuild_graph`, and `list_brains` when using a workspace. Responses include `activeBrain` / `workspaceRoot` where applicable.

## Obsidian

- Wikilink syntax `[[page]]` is first-class.  
- Use **Open in Obsidian** from the wiki view; adjust vault name in `apps/dashboard/src/app/wiki/page.tsx` if yours differs.  
- Keep assets under `assets/` with relative paths when adding media later.

## Scheduling (cron / launchd)

Suggested cadence for a personal operator:

| Job | Frequency |
|-----|-----------|
| `brain ingest` | Daily or after heavy capture |
| `brain lint` | Weekly |
| `brain review` | Weekly (e.g. Friday) |
| `brain video` | Daily (optional) |
| `brain compile` | After manual bulk edits |

## Architecture notes

- **Ingest**: SHA-256 hashes in `.brain/file-hashes.json`, summaries in `.brain/ingest-cache.json`, runs under `.brain/runs/`.  
- **Search**: JSON index in `.brain/search-index.json` (rebuilt on ingest/compile).  
- **Graph**: `.brain/graph.json` from wiki wikilinks + unresolved targets.  
- **PDF**: via `pdf-parse` (may need system deps in constrained environments).

## Recommended v2+ enhancements

Longer lists (trust, workflow, knowledge UX, search, media, outputs, safety) live in **[`docs/ROADMAP-V2.md`](docs/ROADMAP-V2.md)** — **recommendations only**, not commitments.

**High level:** local semantic ranker on the file index; merge suggestions for near-duplicate pages; confidence/provenance per claim; OCR for screenshots; voice + diarization for transcripts; MOC generator per domain; relationship map; timeline view; focus mode by domain; prompt library sync (`wiki/prompts/` ↔ `.brain/prompts/`); incremental git staging with richer messages.

**Code seams** for future trust features (enrichment, suggest-commit, review state) are noted in [`packages/core/src/trust/README.md`](packages/core/src/trust/README.md).

## Product framing

**Problem:** Capturing notes is easy; **synthesizing** durable knowledge is hard.  
**Vision:** Obsidian for visibility, git for trust, LLM for maintenance, dashboard for operations, MCP for interoperability — all **local and inspectable**.

---

See your brain’s **`CLAUDE.md`** (from `brain init`) for operating rules: folder roles, ingest/wiki/output/lint/git/video expectations, and promotion rules from `outputs/` → `wiki/`.

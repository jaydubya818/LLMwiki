# Second Brain AI — Local LLM Wiki

A **local-first** personal knowledge OS: immutable `raw/` sources are compiled into an **AI-maintained markdown wiki**, with a **premium dashboard**, **git diff review**, **full-text search**, a **knowledge graph**, optional **HeyGen** video, and an **MCP server** for other agents.

- **Canonical storage**: Markdown + folders (Obsidian-friendly).
- **Trust boundary**: Git diffs on `wiki/` before commit.
- **No vector DB** and **no cloud backend** in v1.

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
| `brain init [--target dir]` | Legacy: scaffold a **standalone** brain folder + git init |
| `brain ingest [--force]` | Scan `raw/`, update wiki, INDEX/dashboard markers, hashes, graph, search index, `log.md` |
| `brain compile` | Rebuild `graph.json` + `search-index.json` |
| `brain ask "…" [--promote]` | Answer from wiki context → `outputs/reports/` |
| `brain review` | Executive weekly markdown → `outputs/reviews/` |
| `brain lint` | Health report → `outputs/health-checks/` |
| `brain video` | Daily script + `videos/daily_videos.md`; HeyGen if configured |
| `brain graph` | Rebuild graph only |
| `brain diff` | Show `git diff` for `wiki/` |
| `brain approve [--all] [-m msg]` | Commit approved paths from review state, or all wiki |
| `brain output <kind> "<topic>"` | `brief`, `compare`, `project-summary`, `research`, etc. |
| `brain dashboard` | Dev server for the dashboard app |
| `brain mcp` | Spawn MCP server (stdio) |

Global options: `brain -r /path/to/brain <command>` (single brain), `brain -w /workspace <command>` and `brain -b <name> <command>` (multi-brain).

## Dashboard

- **Home**: trust banner, **readiness (doctor, cached)** from **`.brain/last-doctor.json`** (no full doctor re-run on each refresh), plus staleness/trust hints vs current git/state; Obsidian vault name hint; weekly workflow; metrics and actions as before  
- **Doctor** (`/doctor`): default **cached** snapshot from `last-doctor.json`; **Run fresh check** calls the live doctor API (does not update the cache from the browser — run `brain doctor` in the CLI to refresh the cache)  
- **Workspace / Promotions** (multi-brain only): registry-level overview when `SECOND_BRAIN_WORKSPACE` is set  
- **Search**: full-text over wiki / raw / outputs; optional “All brains” in workspace mode  
- **Wiki**: sidebar file tree, rendered markdown, wikilinks, Obsidian URI using `SECOND_BRAIN_VAULT_NAME` / `.brain/settings.json` / folder basename / `SecondBrain` fallback  
- **Graph**: `@xyflow/react` view; orphan / hub emphasis  
- **Diff**: unified diff + **per-path approve/reject** stored in `.brain/review-state.json`; suggested commit message from last ingest  
- **Runs / Video**: run JSON history and daily video panel  

### Dashboard env

Run `brain dashboard` (sets `SECOND_BRAIN_ROOT` or workspace env for the child process) **or** export the same variables and `npm run dev -w @second-brain/dashboard`.

## Git workflow (trust boundary)

**Uncommitted `wiki/` changes are provisional.** Ingest only *proposes* updates; you decide what becomes history.

1. Run `brain ingest` (or dashboard **Ingest**).  
2. Inspect **`brain diff`** or the **Diff** page — read the full patch.  
3. Optionally mark each path **Approve** / **Reject** / **Clear** in the UI (stored under `.brain/review-state.json`).  
4. Commit: **`brain approve`** commits **approved** paths only and clears matching review entries; rejected paths are restored from `HEAD` for that file.  
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

## Recommended v2 enhancements

- **Local semantic ranker** (lightweight embeddings) on top of the file index  
- **Merge suggestions** for near-duplicate wiki pages  
- **Confidence / provenance** annotations per claim  
- **OCR pipeline** for `raw/screenshots/`  
- **Voice note ingest** and automatic diarization for `raw/transcripts/`  
- **MOC generator** per domain with automated `INDEX` sections  
- **Relationship map** for people ↔ projects ↔ decisions  
- **Timeline view** for decisions and outputs  
- **Focus mode** (filter dashboard + search by domain)  
- **Prompt library** sync with `wiki/prompts/` and versioned `.brain/prompts/`  
- **Incremental git staging** UI with generated commit messages from run summaries  

## Product framing

**Problem:** Capturing notes is easy; **synthesizing** durable knowledge is hard.  
**Vision:** Obsidian for visibility, git for trust, LLM for maintenance, dashboard for operations, MCP for interoperability — all **local and inspectable**.

---

See your brain’s **`CLAUDE.md`** (from `brain init`) for operating rules: folder roles, ingest/wiki/output/lint/git/video expectations, and promotion rules from `outputs/` → `wiki/`.

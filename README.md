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
brain init --target ~/second-brain
export SECOND_BRAIN_ROOT=~/second-brain
brain compile
brain ingest
brain dashboard   # starts Next.js on PORT from .env (default 3847)
```

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

- **Home**: status, brain name + workspace path when set, quick actions (ingest / compile / lint), run history, log tail  
- **Workspace**: all brains, active brain, cross-brain run feed, promotion alerts, optional LLM sync summary  
- **Promotions**: review candidates and promote into master with provenance  
- **Search**: full-text over wiki / raw / outputs with scope filter  
- **Wiki**: rendered markdown, wikilinks, “Open in Obsidian” URI (`vault` name `SecondBrain` — rename in `wiki/page.tsx` if needed)  
- **Graph**: `@xyflow/react` view; orphan / hub emphasis  
- **Diff**: patch + per-file approve/reject (persists via `.brain/review-state.json`; then `brain approve`)  
- **Runs / Video**: run JSON history and daily video panel  

## Git workflow

1. Run `brain ingest` (or dashboard **Ingest**).  
2. Inspect `brain diff` or the **Diff** UI.  
3. Mark files approved/rejected in the UI (optional).  
4. `brain approve` (selected) or `brain approve --all -m "wiki: ingest …"`.

Rejected files are checked out from `HEAD` via `git checkout -- path`.

## Obsidian

- Wikilink syntax `[[page]]` is first-class.  
- Use **Open in Obsidian** from the wiki view; adjust vault name in `apps/dashboard/src/app/wiki/page.tsx` if yours differs.  
- Keep assets under `assets/` with relative paths when adding media later.

## MCP (Cursor, Claude Desktop, etc.)

stdio server:

```json
{
  "mcpServers": {
    "second-brain": {
      "command": "node",
      "args": ["/absolute/path/to/My LLM Wiki/packages/mcp/dist/index.js"],
      "env": {
        "SECOND_BRAIN_WORKSPACE": "/absolute/path/to/your-workspace",
        "SECOND_BRAIN_NAME": "master"
      }
    }
  }
}
```

Or: `brain mcp` with `SECOND_BRAIN_WORKSPACE` and optional `SECOND_BRAIN_NAME` (or legacy `SECOND_BRAIN_ROOT`).

**Tools**: `search_brain`, `read_page`, `list_wiki_pages`, `graph_neighbors`, `recent_changes`, `run_ingest`, `run_lint`, `generate_output`, `daily_video_script`, `rebuild_graph`, plus **`list_brains`** when `SECOND_BRAIN_WORKSPACE` is set. JSON payloads include `activeBrain` (and `workspaceRoot` when applicable) so answers stay brain-scoped.

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

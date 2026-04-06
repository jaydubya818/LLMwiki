# Governance, review & canonical curation (v2/v3)

This pass layers **advisory** workflows on top of the existing single-brain Second Brain: everything stays **local**, **markdown-first**, and **inspectable** under `.brain/` and `outputs/reviews/`.

## Principles

- **No fake precision** — buckets, ages, and scores are heuristics to steer attention.
- **Canon is not a dump target** — canonical updates flow through **proposed** files and git review when possible.
- **Advisory vs high-trust** — JSON sidecars and digest markdown are **signals**; git + your explicit approvals remain **high-trust**.

## Feature overview

| Feature | State file(s) | What it answers |
|--------|----------------|-----------------|
| **Canon promotion workflow** | `.brain/canon-promotions.json` | Is this artifact worth trusted long-term knowledge? |
| **Review SLA hints** | `.brain/review-sla.json` | What review work is getting old? |
| **Decision impact map** | `.brain/decision-impact.json` | If this decision changes, what else moves? |
| **Steward digest** | `outputs/reviews/steward-digest-*.md` | What should a domain steward skim this week? |
| **Evidence change alerts** | `.brain/evidence-baseline.json`, `.brain/evidence-change-alerts.json` | Did support for this page materially shift? |
| **Snapshot diff bundles** | `.brain/snapshot-bundles.json`, `outputs/reviews/snapshots/` | What changed over time for important pages? |
| **Resolution quality** | `.brain/resolution-quality.json` | Are conflict resolutions substantive or thin? |
| **Canon drift watchlist** | `.brain/canon-drift-watchlist.json` | Which trusted pages need extra vigilance? |
| **Review session mode** | `.brain/review-session-state.json` | What should I review next, in order? |
| **Quarterly operational review** | `outputs/reviews/quarterly-review-*.md` | What moved strategically this quarter? |

## Trust & curation v2 (single-brain)

These layers sit on the same principles: **local JSON + markdown**, **no fake precision**, **git remains high-trust**. They strengthen *where to look* and *why a decision stuck*, not automated truth.

| Feature | State / output | What it answers |
|--------|----------------|-----------------|
| **Canonical Review Board** | `.brain/canonical-board.json` | What high-trust pages need attention (locks, proposals, drift, thin evidence)? |
| **Resolution memory** | `.brain/resolutions.json` | Why did we resolve this conflict / drift / unsupported flag? |
| **Evidence density meter** | `.brain/evidence-density.json` | Is this page thin or well-supported (sources, trace, synthesis mix)? |
| **Drift → decision bridge** | `.brain/drift-decision-links.json` | Which open drift items touch decision pages or ledger links? |
| **Domain steward mode** | `/steward`, `outputs/reviews/steward-digest-*.md` | What matters in *one* domain this week? |
| **Human-reviewed badge** | Frontmatter + `.brain/human-review.json` | AI synthesis vs explicit human review (and stale review after edits)? |
| **Source supersession** | `.brain/source-supersession.json` | Might a newer raw file supersede an older one (same folder / dated names)? |
| **Review packet generator** | `outputs/reviews/review-packet-*.md` | One markdown bundle for a 10–20 min review pass? |
| **Canonical snapshotting** | `outputs/reviews/snapshots/`, `.brain/snapshot-bundles.json` | What did this page look like before a big change? |
| **Cross-signal correlation** | `.brain/cross-signal-correlation.json` | Which pages combine *multiple* risk signals (“real dragons”)? |
| **Canon council (executive)** | `.brain/canon-council.json` | What trusted / canon-bound work needs attention *right now* (compact panel)? |
| **Review debt meter** | `.brain/review-debt.json` | How much review-ish work is piling up (advisory level + contributors + trend)? |
| **Quarter-over-quarter diff** | `outputs/reviews/quarter-diff-*.md` | How did quarterly reflection change — structured section/bullet synthesis? |
| **Decision sunset hints** | `.brain/decision-sunset.json` | Which older decisions may no longer fit the world (age + linked signals)? |
| **Strategic theme tracker** | `.brain/strategic-themes.json`, optional `wiki/work/strategic-themes.md` | What themes keep recurring across loops, decisions, queues (heuristic)? |
| **Confidence delta history** | `.brain/confidence-history.json` | Is this page’s *advisory* composite trending up or down over time? |
| **Human override journal** | `.brain/human-overrides.json` | Where did I deliberately diverge from AI / system suggestions (and why)? |
| **Canon admission checklist** | `.brain/canon-admission.json` | Has this page *earned* high-trust / canon promotion (pass/warn/fail gates)? |
| **Governance settings** | `.brain/governance-settings.json` (optional) | Tune auto-capture, rationale prompts, snapshot-before-canon, council minutes mode. |
| **Governance action log** | `.brain/governance-action-log.json` | Append-only index of dashboard governance actions → overrides / resolutions / minutes links. |
| **Council minutes** | `outputs/reviews/canon-council-minutes-log.md` (+ optional timestamped files) | High-signal “what did we decide in council-style reviews?” without meeting bloat. |
| **Review workload balancing** | `outputs/reviews/review-plan-*.md` (on demand) | I only have 10 or 30 minutes — what’s the best next review path? |
| **Reflective annual review** | `outputs/reviews/annual-review-*.md` | Year-shaped memo on how the operating system / knowledge evolved. |

### How to interpret heuristics

- **Good at:** prioritizing human time, surfacing combinations of weak support + canon + drift, preserving *decision rationale* in plain JSON, and keeping everything diffable in git beside `wiki/`.
- **Not good at:** semantic fact-checking, legal defensibility, or knowing whether two dated files are “really” the same topic beyond filename patterns.
- **Evidence density** measures *support depth and trace coverage*, not correctness. **Supersession** is conservative (same-directory dated pairs) — confirm in prose when it matters.
- **Cross-signal** only promotes items when **several** independent signals agree; single-flag noise should not dominate.

### Decision stubs (human confirm)

- **Dashboard** `/decision-draft` or **`brain decision-draft <path> [--write]`** builds a markdown stub from a raw or output file only after you confirm (**Write** / **`--write`**).
- Frontmatter **`include_in_ledger: false`** keeps the file **out of** `.brain/decision-ledger.json` and **`wiki/decisions/INDEX.md`** until you set it to `true` and run ledger refresh — reduces noise while you scale drafts.

### Trace section markers (optional)

- Place `<!-- trace:your-stable-id -->` on its own line **immediately before** a `## Heading` in wiki markdown. The next ingest that rebuilds the claim-trace sidecar will use **`your-stable-id`** as that section’s `id` (easier cross-references than auto `sec-0-…` slugs).

### Cadence additions

- After **`brain lint`** or **`brain operational refresh`**, open **`/canonical-board`** and **`/cross-signal`** for the hottest rows.
- When closing a trust queue item, optionally fill **Resolution memory** on Conflicts / Unsupported / Drift — future you gets the “why.”
- Monthly: generate **`brain review-packet`** (or dashboard button) before a focused session; snapshot canon pages before large merges (**`brain snapshot`** or wiki panel).

## Cadence

### Weekly (~30–60 min)

1. **`brain ingest`** (if you captured raw notes).
2. **`brain lint`** — refreshes operational intelligence **and** governance JSON (tail of lint).
3. **Diff** — approve wiki + proposed updates.
4. Open **Governance** dashboard: skim SLA rows, canon promotions, watchlist.
5. Optional: **Canonical board** (`/canonical-board`) + **cross-signal** top rows.
6. Optional: **Review session mode** for focused passes.
7. Optional: **`brain steward-digest --domain <x>`** or **`/steward`** for one busy domain.

### Monthly

- Run **steward digests** for domains that felt noisy.
- Clear or downgrade **evidence change alerts** after you have reviewed pages.
- Export **snapshot bundle summary** for 1–2 canon pages that changed.

### Quarterly

- **`brain quarterly-review`** (or dashboard button) — reflective synthesis from ledger + trust files.
- Re-read **decision impact** for top decisions; archive or supersede stale memos explicitly.

## CLI

| Command | Purpose |
|--------|---------|
| `brain governance-refresh` | Same refresh chain as after `brain lint` (operational + governance). |
| `brain canonical-board` | Print or inspect canonical board JSON (after refresh). |
| `brain resolutions` | List resolution memory records. |
| `brain correlations` | Print cross-signal correlation summary. |
| `brain review-packet` | Write `outputs/reviews/review-packet-*.md`. |
| `brain snapshot wiki/... [-m reason]` | Dated snapshot under `outputs/reviews/snapshots/`. |
| `brain canon-guard …` | Off-dashboard trust scan for wiki git diffs (`--json`, `--no-save`, `--staged-only`, `--unstaged-only`, `--hook`, optional paths). Writes `.brain/last-canon-guard.json` by default cache. |
| `brain install-hooks` | Writes `.git/hooks/pre-commit` to run `brain canon-guard --hook` (warn-only unless settings say otherwise). |
| `brain steward --domain work` | Alias for steward digest (one domain). |
| `brain steward-digest --domain work` | One-domain digest. |
| `brain steward-digest --all` | All active domains. |
| `brain quarterly-review` | Quarterly markdown report. |
| `brain review-session` | Print session JSON. |
| `brain review-session --rebuild` | Rebuild queue after refresh. |
| `brain canon-council` | TSV rows from `.brain/canon-council.json` (after refresh). |
| `brain review-debt` | Summary lines from `.brain/review-debt.json`. |
| `brain decision-sunset` | TSV rows from `.brain/decision-sunset.json`. |
| `brain qoq-diff --from <p> --to <p>` | Write `outputs/reviews/quarter-diff-*.md`. |
| `brain annual-review` | Write `outputs/reviews/annual-review-*.md`. |
| `brain review-plan [--minutes 10\|30\|60] [--write]` | Print JSON plan; optional markdown under `outputs/reviews/`. |
| `brain overrides [--limit n]` | Human override journal TSV. |

## Dashboard

- **Canonical board** (`/canonical-board`) — sortable control room for canon / locks / proposals and trust signals.
- **Resolutions** (`/resolutions`) — browse `.brain/resolutions.json`.
- **Cross-signal** (`/cross-signal`) — multi-signal “dragon” list with plain-language reasons.
- **Steward** (`/steward`) — domain-scoped digest links and filters.
- **Governance** — hub + refresh + digest/quarterly actions.
- **Canon promotions** — queue, approve/defer, **materialize → proposed update** (never silent overwrite).
- **Review session** — step through queue; optional session summary markdown.
- **Canon drift watchlist** — trusted + risky intersection; **snapshot copy** action.
- **Decision impact** — ledger entries with related pages and open trust items.
- **Review priority queue** — shows **SLA aging** hints when available.
- **Canon council** (`/canon-council`) — executive panel: canon board hot rows, promotions, watch-on-canon, evidence alerts, recent resolutions.
- **Review debt** — Home + Executive; file `.brain/review-debt.json`.
- **Decision sunset** (`/decision-sunset`) — aging / stressed decisions; Decision ledger links here.
- **Strategic themes** (`/strategic-themes`) — heuristic recurrence view + wiki mirror when refreshed.
- **QoQ diff** (`/qoq-diff`) — pick two quarterly reviews; writes structured diff markdown.
- **Human overrides** (`/human-overrides`) — append-only journal + filter UI.
- **Canon admission** (`/canon-admission`) — checklist rows per promotion / high-trust targets.
- **Executive** — review debt strip + one-click review plans + annual review action.

## API

`GET/POST /api/governance` — loads governance JSON (+ optional `?actionLogLimit=N` for a slice of **governance-action-log**). POST actions include `refresh`, **`governance-settings-patch`**, canon promotion update/materialize (**materialize** may return **409 SNAPSHOT_REQUIRED**), **`review-session-mark-item`**, evidence alert status, page snapshot, session rebuild/cursor/summary, steward digest, quarterly review.

`POST /api/canon-council` (optional dashboard API key): `page-snapshot`, `mark-reviewed`, `write-minutes`.

Additional JSON routes (read-mostly): `GET /api/review-debt`, `GET/POST /api/canon-council`, `/api/decision-sunset` + `POST` status updates (+ optional `rationale`), `/api/strategic-themes`, `/api/confidence-history?path=`, `/api/human-overrides` + `POST` new override, `/api/canon-admission` + `POST` patch note/decision (+ optional `rationale`, council minutes payload), **conflicts / drift / unsupported-claim** POST paths now append **human overrides** + **action log** on status changes, `GET/POST /api/qoq-diff`, `GET/POST /api/review-plan`, `POST /api/annual-review`.

## Cadence: weekly → annual (using this pass)

- **Weekly** — after ingest/diff: skim **Canon council** or **Review debt** on Home; if ≤15m, generate a **10min review plan** from Executive; use **Review session** for pacing.
- **Monthly** — open **Strategic themes** + **Decision sunset**; pick 1–2 hints to close or revalidate.
- **Quarterly** — run `brain quarterly-review`; optionally **QoQ diff** vs prior quarter file; archive both under `outputs/reviews/`.
- **Annual** — `brain annual-review` (or Executive button) after quarters exist; treat the memo as a narrative prompt, not a performance report.

### Advisory vs stronger signals

- **Advisory / triage:** theme titles, debt *level*, confidence *trend*, QoQ bullet diff, council *priorityScore* — good for “where to look.”
- **Stronger human-trust signals:** git-reviewed merges, explicit **resolutions**, **canon admission** decisions you mark `ready`, **human override** entries with rationale, frontmatter **human-reviewed** after you mean it.

## Human intent capture & audit trail (this pass)

Goal: **preserve human judgment automatically** where you already act — without replacing the manual override journal or adding a database.

### Automatic human override entries

When **autoCaptureOverrides** is on (default), the dashboard appends rows to **`.brain/human-overrides.json`** for actions such as:

- Canon **promotion** status changes (approve / reject / defer)
- **Conflict** / **drift** / **unsupported-claim** status changes (esp. with resolution memory)
- **Decision sunset** status changes
- **Canon admission** when `finalDecision` changes
- **Canon council** “mark reviewed” actions (POST)
- **Review session** “mark item” (see `review-session-mark-item` on `/api/governance`)

New fields on each record (when present): **`autoCaptured`**, **`sourceWorkflow`**, **`actionTaken`**, **`relatedItemId`**, **`linkedResolutionId`**, **`linkedSnapshotId`**, **`linkedCouncilMinutesPath`**.

Short rationale is **optional** by default. If **`requireRationaleForCanonOverrides`** is `true`, high-signal paths (e.g. **`wiki/decisions/`**, blocked canon admission marked `ready`, rejected promotion on a canonical decision page) require a non-empty rationale **before** the API applies the change.

Copy **`.brain/governance-settings.example.json`** → **`.brain/governance-settings.json`** to override defaults (file is optional until you create it).

### Council minutes

- **Rolling log:** `outputs/reviews/canon-council-minutes-log.md` — dated sections prepended when you pass **`appendCouncilMinutes`** on promotion/admission/council APIs, or when **`autoGenerateCouncilMinutes`** is on for high-signal captures.
- **Session file:** POST **`/api/canon-council`** with `action: "write-minutes"` (or use **`councilMinutesMode: "session"`** plus explicit minutes on other routes) to create **`outputs/reviews/canon-council-minutes-<timestamp>.md`**.

### Snapshot-before-canon guardrail

**Materialize canon promotion** checks **`.brain/snapshot-bundles.json`** for a recent snapshot of the **target wiki page** (default freshness: **21 days**, configurable).

- If **`requireSnapshotBeforeCanon`** is true and there is no recent snapshot: with **`autoSnapshotWhenMissingBeforeCanon`** true (default), a snapshot is created automatically; otherwise the API returns **409** with **`code: "SNAPSHOT_REQUIRED"`** so you can snapshot manually first.
- The promotion record stores **`linkedSnapshotId`** when the guard runs.

### Richer canon admission

**`.brain/canon-admission.json`** criteria now carry **`tier`**: **`advisory`** vs **`strong`**. **Strong + `fail`** yields **`readinessSummary: "blocked"`** until you explicitly override (mark `ready` with rationale when settings require it). Additional checks: **page quality**, **confidence trend**, **recent snapshot**, **decision-impact** linkage.

### Governance action log

**`.brain/governance-action-log.json`** holds a bounded list of **who did what in the dashboard** (workflow, action, paths, optional `overrideId`, `resolutionId`, `snapshotId`). Optional: `GET /api/governance?actionLogLimit=40`.

### Weekly / monthly cadence (governance-heavy)

- **Weekly (~20–40 min):** Canon council or review session → act on 2–3 items; overrides and resolutions populate automatically. Skim **Human overrides** filtered to **auto** if you want a “machine-assisted” trail only.
- **Monthly (~30 min):** Open **Canon admission** and **Decision sunset**; for anything you mark `ready` under warnings, add one line of rationale when prompted. Append **council minutes** after the pass if you want a durable memo (`write-minutes` on council API or Executive note).

### Canon guard (off-dashboard trust)

**`brain canon-guard`** inspects **git-scoped wiki changes** (staged, unstaged, and untracked `.md` under your wiki prefix) and warns when **canonical / locked / manual-review** pages are edited **outside the dashboard** without a **recent snapshot** or **nearby governance trail** (action log, overrides, promotions, canon admission — roughly the last **72 hours**).

- **Output:** per-file **OK / WARN / HIGH ATTENTION**, trust-field deltas (vs `HEAD`), snapshot age from **`.brain/snapshot-bundles.json`**, and suggested next steps (`brain snapshot …`, council / admission, override journal).
- **Cache:** default run writes **`.brain/last-canon-guard.json`** for **`brain doctor`** and the **dashboard home** card (use **`--no-save`** to skip).
- **Flags:** **`--json`**, **`--staged-only`**, **`--unstaged-only`**, optional path args, **`--hook`** (for git — see below).
- **Settings** (`.brain/governance-settings.json`): **`canonGuardEnabled`** (when false: **doctor** skips the summary and **`brain canon-guard --hook`** exits immediately; manual **`brain canon-guard`** without **`--hook`** still runs), **`canonGuardHookWarnOnly`** (default **true** — hook exits **0** even on HIGH ATTENTION), **`canonGuardRequireRecentSnapshot`**, **`canonGuardStrictTrustDelta`**, **`installGitHooks`** (informational, set by **`brain install-hooks`**).

**`brain install-hooks`** writes **`pre-commit`** under **`.git/hooks/`** to run **`brain canon-guard --hook`**. Default is **warn-only**; set **`canonGuardHookWarnOnly: false`** to **block** commits when the report reaches **HIGH ATTENTION**. Ensure **`brain`** is on **`PATH`** when git runs the hook (or edit the hook to use an absolute path to the CLI).

**Suggested use:** run **`brain canon-guard`** before committing if you edit canon or locked pages in **Obsidian**, **VS Code**, or **scripts**; enable the hook if you do that often.

## Heuristic details (short)

- **SLA buckets** — `fresh` &lt; 7d, `aging` 7–21d, `overdue` &gt; 21d since last relevant timestamp (per item type).
- **Evidence fingerprints** — combine page quality, open unsupported count, drift/conflict flags, trace source counts — compared run-over-run.
- **Resolution quality** — text heuristics on conflict resolution notes only; encourages specificity and links.

---

This layer should **reduce silent rot** without turning the vault into bureaucracy: ignore noise, act on patterns, keep canon promotion **intentional**, and use the executive pass to see **long arcs** (debt, themes, quarterly/annual reflection) without drowning in metrics.

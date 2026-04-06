## Learned User Preferences

- Extend the Second Brain / LLM Wiki with iterative trust, explainability, governance, and operational-intelligence passes on the existing single-brain model; do not build multi-brain until explicitly requested, and avoid rewriting core architecture.
- Keep work local-first, markdown-first, file-backed, and inspectable; stay aligned with git-trust, dashboard, and provenance patterns; avoid heavy cloud infrastructure and fake precision.
- Use repo-root `AGENTS.md` as the canonical agent memory for this vault; do not use `apps/dashboard/AGENTS.md` unless it is the only available project AGENTS file.
- Operate with a personal master brain for curated knowledge plus separate agent-specific brains (e.g. coding vs strategy); promote durable, high-value content into master only after review so master does not absorb noisy agent output automatically.

## Learned Workspace Facts

- This project is a local-first Second Brain / LLM Wiki (Karpathy-style knowledge base): `raw/`, `wiki/`, `outputs/`, `videos/`, with `CLAUDE.md` and append-only `log.md` as part of the operating schema per brain.
- The codebase is organized as a monorepo with `packages/core`, `packages/cli`, and `apps/dashboard` (Next.js local dashboard) on top of shared markdown/git workflows.

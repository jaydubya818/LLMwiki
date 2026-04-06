import fs from "node:fs/promises";
import path from "node:path";
import { brainPaths } from "./paths.js";
import { ensureGitRepo } from "./git/service.js";

const RAW_SUB = [
  "inbox",
  "articles",
  "notes",
  "meeting-notes",
  "transcripts",
  "screenshots",
  "docs",
  "research",
  "journal",
  "bookmarks",
] as const;

const WIKI_SUB = [
  "topics",
  "projects",
  "people",
  "decisions",
  "concepts",
  "systems",
  "research",
  "health",
  "goals",
  "writing",
  "prompts",
  "weekly-reviews",
  "life",
  "work",
] as const;

const OUTPUT_SUB = [
  "briefs",
  "reports",
  "comparisons",
  "plans",
  "reviews",
  "health-checks",
  "presentations",
] as const;

export interface ScaffoldOptions {
  /** When true, do not run git init in the brain folder (workspace owns git). */
  skipGit?: boolean;
  /** Override default CLAUDE.md body */
  claudeMarkdown?: string;
}

export async function scaffoldBrain(
  root: string,
  options?: ScaffoldOptions
): Promise<void> {
  const p = brainPaths(root);

  for (const s of RAW_SUB) {
    await fs.mkdir(path.join(p.raw, s), { recursive: true });
  }
  for (const s of WIKI_SUB) {
    await fs.mkdir(path.join(p.wiki, s), { recursive: true });
  }
  for (const s of OUTPUT_SUB) {
    await fs.mkdir(path.join(p.outputs, s), { recursive: true });
  }
  await fs.mkdir(path.join(p.videos, "scripts"), { recursive: true });
  await fs.mkdir(path.join(p.assets, "images"), { recursive: true });
  await fs.mkdir(path.join(p.assets, "diagrams"), { recursive: true });
  await fs.mkdir(p.runsDir, { recursive: true });
  await fs.mkdir(p.promptsDir, { recursive: true });
  await fs.mkdir(p.templatesDir, { recursive: true });

  await writeIfMissing(p.claudeMd, options?.claudeMarkdown ?? CLAUDE_MD);
  await writeIfMissing(
    p.readme,
    `# Second Brain AI — Local LLM Wiki\n\nSee repository-level README for tooling. Brain-specific guide is in \`CLAUDE.md\`.\n`
  );
  await writeIfMissing(
    p.logMd,
    `# Brain log\n\nAppend-only operations log for ingests, compiles, lint, outputs, and video runs.\n\n`
  );
  await writeIfMissing(
    p.indexMd,
    `# Wiki index\n\n${CATALOG_MARKERS}\n\n## Domains\n\n${WIKI_SUB.map((s) => `- **${s}/**`).join("\n")}\n`
  );
  await writeIfMissing(
    p.dashboardMd,
    `# Dashboard\n\nLiving command center maintained by ingestion + lint.\n\n${DASH_MARKERS}\n\n## Priority topics\n\n_TBD_\n\n## Unresolved gaps / questions\n\n_TBD_\n\n## Suggested next queries\n\n- What changed in wiki this week?\n- Which orphan pages need links?\n`
  );
  await writeIfMissing(
    p.dailyVideosMd,
    `# Daily videos\n\nAppend-only history of scripts and rendered URLs.\n\n`
  );
  await writeIfMissing(
    path.join(p.envFile),
    `OPENAI_API_KEY=\nOPENAI_MODEL=gpt-4o-mini\n# HEYGEN_API_KEY=\n# HEYGEN_API_BASE=https://api.heygen.com/v2\n# SECOND_BRAIN_ROOT is set by CLI cwd/root\nDASHBOARD_PORT=3847\n`
  );
  await writeIfMissing(
    path.join(root, ".gitignore"),
    `.env\n.brain/search-index.json\n.brain/graph.json\nnode_modules\n`
  );

  const sampleRaw = path.join(p.raw, "inbox", "hello-brain.md");
  await writeIfMissing(
    sampleRaw,
    `# Hello Second Brain\n\nThis is sample immutable source material in raw/inbox.\n\n- Ingest will synthesize into wiki pages.\n- Edit freely here; AI should not mutate raw/.\n`
  );

  await writePrompts(p);
  await writeTemplates(p);

  await writeIfMissing(p.stateJson, JSON.stringify({ version: 1 }, null, 2));
  await writeIfMissing(p.fileHashesJson, `{}`);
  await writeIfMissing(p.ingestCacheJson, `{}`);

  if (!options?.skipGit) {
    await ensureGitRepo(root);
  }
}

const CATALOG_MARKERS = `<!-- BRAIN_CATALOG_START -->\n_Initial catalog — run \`brain ingest\`._\n<!-- BRAIN_CATALOG_END -->`;
const DASH_MARKERS = `<!-- BRAIN_ACTIVITY_START -->\n_No runs yet._\n<!-- BRAIN_ACTIVITY_END -->`;

async function writeIfMissing(file: string, content: string): Promise<void> {
  try {
    await fs.access(file);
  } catch {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, "utf8");
  }
}

async function writePrompts(p: ReturnType<typeof brainPaths>): Promise<void> {
  const files: Record<string, string> = {
    "ingest.md": "Ingest: synthesize sources into wiki pages with stable slugs.",
    "compile.md": "Compile: refresh graph/search indexes; keep prose stable.",
    "ask.md": "Ask: answer from retrieved wiki context with citations.",
    "lint.md": "Lint: find orphans, staleness, weak links, contradictions.",
    "review.md": "Review: weekly executive narrative from dashboard + index.",
    "video.md": "Video: 150w first-person script grounded in wiki.",
  };
  for (const [name, body] of Object.entries(files)) {
    await writeIfMissing(path.join(p.promptsDir, name), `# ${name}\n\n${body}\n`);
  }
}

async function writeTemplates(p: ReturnType<typeof brainPaths>): Promise<void> {
  const files: Record<string, string> = {
    "wiki-page.md": "---\ntitle:\ntype: topic\ndomain: topics\nlast_updated:\nsources: []\n---\n\nExecutive summary here.\n",
    "project-page.md": "---\ntitle:\ntype: project\ndomain: projects\nstatus: active\nlast_updated:\n---\n\n## Status\n\n## Risks\n\n## Next steps\n",
    "person-page.md": "---\ntitle:\ntype: person\ndomain: people\nlast_updated:\n---\n\nRespectful, useful context.\n",
    "decision-page.md": "---\ntitle:\ntype: decision\ndomain: decisions\nlast_updated:\n---\n\n## Context\n\n## Options\n\n## Decision\n",
    "weekly-review.md": "# Weekly review\n\n## Wins\n\n## Misses\n\n## Focus next week\n",
    "health-check.md": "# Health check\n\nFindings from automated lint.\n",
    "output-brief.md": "# Brief\n\n## Ask\n\n## Answer\n\n## Sources\n",
  };
  for (const [name, body] of Object.entries(files)) {
    await writeIfMissing(path.join(p.templatesDir, name), body);
  }
}

const CLAUDE_MD = `# Second Brain AI Operating Schema

## Purpose
Local-first, AI-maintained knowledge base: raw inputs → persistent wiki → durable outputs.

## raw/
Immutable sources. Never rewrite files here.

## wiki/
AI-maintained synthesis. Prefer updating pages over duplicating. Stable kebab-case names.

## outputs/
Generated artifacts; promote high-value work back into wiki/ per promotion rules in README.

## videos/
Scripts + append-only daily_videos.md history.

## .brain/
Caches, indexes, runs — operational, not durable knowledge.

## Priority domains
Work leadership, projects, architecture, AI systems, research, writing, goals, health, life systems, decisions, learning, people.

## Page standards
- YAML frontmatter (title, type, domain, last_updated, sources, tags)
- One-paragraph executive summary first
- Sections + [[wikilinks]] + Sources
- Readable in Obsidian without plugins

## Ingest rules
Scan new/changed files in raw/, extract text (md, txt, json, csv, pdf), hash + cache, synthesize into wiki, update INDEX/dashboard markers, append log.

## Git trust boundary
Review wiki changes via diff before commit. Use review-state for per-file approve/reject when needed.

## Dashboard expectations
Surface recency, orphans, contradictions, suggested actions — operational, not decorative.

## MCP expectations
Expose narrow local tools for search/read/graph/trigger operations.

## Daily video rules
~150 words, first person, grounded in wiki, avoid topics from last 7 days in daily_videos.md, optional HeyGen when keys exist.

## Writing style
Concise, structured, source-grounded, no fluff.
`;

import fs from "node:fs/promises";
import path from "node:path";
import { brainPaths } from "./paths.js";
import { ensureGitRepo } from "./git/service.js";
import {
  PRODUCTION_CLAUDE_MD,
  VAULT_README,
  STARTER_INDEX_MD,
  STARTER_DASHBOARD_MD,
  RAW_GETTING_STARTED,
  WIKI_OPERATING_CADENCE,
  WIKI_LEADERSHIP_FOCUS,
  WIKI_GOALS_QUARTER,
  WIKI_DECISIONS_PLACEHOLDER,
} from "./scaffold-templates.js";

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

  await writeIfMissing(
    p.claudeMd,
    options?.claudeMarkdown ?? PRODUCTION_CLAUDE_MD
  );
  await writeIfMissing(p.readme, VAULT_README);
  await writeIfMissing(
    p.logMd,
    `# Brain log\n\nAppend-only operations log for ingests, compiles, lint, outputs, and video runs.\n\n`
  );
  await writeIfMissing(p.indexMd, STARTER_INDEX_MD);
  await writeIfMissing(p.dashboardMd, STARTER_DASHBOARD_MD);
  await writeIfMissing(
    p.dailyVideosMd,
    `# Daily videos\n\nAppend-only history of scripts and rendered URLs.\n\n`
  );
  await writeIfMissing(
    path.join(p.envFile),
    `OPENAI_API_KEY=\nOPENAI_MODEL=gpt-4o-mini\n# HEYGEN_API_KEY=\n# HEYGEN_API_BASE=https://api.heygen.com/v2\n# Exact Obsidian vault name for obsidian:// links (optional; else folder basename or SecondBrain fallback)\n# SECOND_BRAIN_VAULT_NAME=\n# SECOND_BRAIN_ROOT is set by CLI cwd/root\nDASHBOARD_PORT=3847\n`
  );
  await writeIfMissing(
    path.join(root, ".gitignore"),
    `.env\n.brain/search-index.json\n.brain/graph.json\nnode_modules\n`
  );

  await writeIfMissing(path.join(p.raw, "inbox", "getting-started.md"), RAW_GETTING_STARTED);

  await writeIfMissing(
    path.join(p.wiki, "topics", "operating-cadence.md"),
    WIKI_OPERATING_CADENCE
  );
  await writeIfMissing(
    path.join(p.wiki, "work", "work-leadership-focus.md"),
    WIKI_LEADERSHIP_FOCUS
  );
  await writeIfMissing(
    path.join(p.wiki, "goals", "goals-current-quarter.md"),
    WIKI_GOALS_QUARTER
  );
  await writeIfMissing(
    path.join(p.wiki, "decisions", "decisions-placeholder.md"),
    WIKI_DECISIONS_PLACEHOLDER
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
    "ingest.md":
      "Role: wiki maintainer. Input: raw path + text. Output plan: domains, slugs, summaries, index lines, dashboard bullets. Prefer updating one primary page; stable kebab slugs; cite sources.",
    "compile.md":
      "Role: indexer only. Do not change wiki prose. Rebuild graph + search JSON from current markdown.",
    "ask.md":
      "Answer from retrieved wiki snippets; cite paths; flag uncertainty; suggest follow-up pages to create.",
    "lint.md":
      "Orphans, stale last_updated, missing wikilinks, possible contradictions — actionable findings only.",
    "review.md":
      "Executive weekly: Snapshot, Wins, Risks, Decisions needed, Next week focus — grounded in dashboard + INDEX.",
    "video.md":
      "~150 words, first person, one reflective question, grounded in wiki; no hype; avoid recent daily topics.",
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


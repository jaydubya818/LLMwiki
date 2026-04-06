import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import {
  hashContent,
  readHashes,
  writeHashes,
  readIngestCache,
  writeIngestCache,
} from "../hash-store.js";
import { appendLog } from "../log-append.js";
import { writeRun } from "../runs.js";
import { writeState } from "../state.js";
import { extractFromFile, extensionSupported } from "../extract/text-extract.js";
import { createLlm } from "../llm/factory.js";
import type { IngestLlmPlan } from "../llm/types.js";
import { heuristicIngestPlan } from "../llm/heuristic.js";
import { buildWikiPageMarkdown, stableSlugFromTitle } from "../wiki/page-build.js";
import {
  CATALOG_END,
  CATALOG_START,
  DASH_ACTIVITY_END,
  DASH_ACTIVITY_START,
  replaceMarkedSection,
} from "../wiki/markers.js";
import matter from "gray-matter";
import { ensureGitRepo, getWikiStatusFilesForBrain } from "../git/service.js";
import { buildSearchIndex } from "../search/indexer.js";
import { buildKnowledgeGraph } from "../graph/builder.js";

const INGEST_SYSTEM = `You are a knowledge wiki maintainer. Output ONLY valid JSON matching this shape:
{
  "summary": "string",
  "entities": [{"name":"string","type":"topic|person|project|decision|concept|system","notes":"optional"}],
  "primaryDomain": one of topics|projects|people|decisions|concepts|systems|research|health|goals|writing|life|work,
  "suggestedPages": [{
    "domain": same enum,
    "slug": "kebab-case-filename-without-md",
    "title": "Human title",
    "executiveSummary": "One paragraph",
    "relatedLinks": ["Other-Page-Titles-As-Wikilinks"],
    "keyPoints": ["bullets"]
  }],
  "indexLines": ["- [[slug]] — one line description"],
  "dashboardBullets": ["- short operational bullet"]
}
Rules: prefer updating granularity with ONE primary page unless multiple distinct entities demand splits. Use stable slugs. relatedLinks are targets for [[wikilinks]] without brackets.`;

export interface IngestResult {
  processed: number;
  skipped: number;
  errors: string[];
  plan?: IngestLlmPlan;
}

export async function runIngest(
  cfg: BrainConfig,
  options: { force?: boolean } = {}
): Promise<IngestResult> {
  const paths = brainPaths(cfg.root);
  await ensureGitRepo(cfg.gitRoot);
  const hashes = await readHashes(paths);
  const cache = await readIngestCache(paths);
  const llm = createLlm(cfg);

  const pattern = path.join(paths.raw, "**/*").replace(/\\/g, "/");
  const files = await fg(pattern, {
    onlyFiles: true,
    dot: false,
  });

  const errors: string[] = [];
  let processed = 0;
  let skipped = 0;
  const catalogLines: string[] = [];
  const dashBullets: string[] = [];

  for (const abs of files) {
    const ext = path.extname(abs);
    if (!extensionSupported(ext)) continue;
    const rel = path.relative(cfg.root, abs).split(path.sep).join("/");
    let textBuf: string;
    try {
      const extracted = await extractFromFile(abs);
      textBuf = extracted.text;
    } catch (e) {
      errors.push(`${rel}: ${String(e)}`);
      continue;
    }
    const h = hashContent(textBuf);
    if (!options.force && hashes[rel] === h) {
      skipped++;
      continue;
    }

    let plan: IngestLlmPlan;
    try {
      if (llm) {
        plan = await llm.completeJson<IngestLlmPlan>(
          INGEST_SYSTEM,
          `Source path: ${rel}\n\nContent:\n${textBuf.slice(0, 12000)}`
        );
      } else {
        plan = heuristicIngestPlan(rel, textBuf);
      }
    } catch (e) {
      errors.push(`${rel} LLM: ${String(e)}`);
      plan = heuristicIngestPlan(rel, textBuf);
    }

    for (const page of plan.suggestedPages) {
      const slug = page.slug || stableSlugFromTitle(page.title);
      const wikiFile = path.join(paths.wiki, page.domain, `${slug}.md`);
      await fs.mkdir(path.dirname(wikiFile), { recursive: true });
      let existing = "";
      try {
        existing = await fs.readFile(wikiFile, "utf8");
      } catch {
        existing = "";
      }
      const mergedSources = new Set<string>(
        existing
          ? ((matter(existing).data as { sources?: string[] }).sources ?? [])
          : []
      );
      mergedSources.add(rel);
      const bodyNote = existing
        ? `\n\n### Ingest merge (${new Date().toISOString()})\n${plan.summary.slice(0, 800)}`
        : "";

      const md = existing
        ? mergeExistingPage(existing, {
            ...page,
            sources: [...mergedSources],
            extraSummary: plan.summary,
          })
        : buildWikiPageMarkdown({
            title: page.title,
            type: "topic",
            domain: page.domain,
            executiveSummary: page.executiveSummary,
            keyPoints: page.keyPoints,
            relatedLinks: page.relatedLinks,
            sources: [...mergedSources],
          }, bodyNote);

      await fs.writeFile(wikiFile, md, "utf8");
    }

    catalogLines.push(...plan.indexLines);
    dashBullets.push(...plan.dashboardBullets);
    hashes[rel] = h;
    cache[rel] = {
      relativePath: rel,
      summary: plan.summary,
      entities: plan.entities.map((e) => e.name),
      lastIngestedAt: new Date().toISOString(),
      contentHash: h,
    };
    processed++;
  }

  await writeHashes(paths, hashes);
  await writeIngestCache(paths, cache);

  await updateIndexAndDashboard(
    paths,
    catalogLines,
    dashBullets,
    processed
  );

  await buildSearchIndex(cfg);
  await buildKnowledgeGraph(cfg).catch((e) =>
    errors.push(`graph: ${String(e)}`)
  );

  const stamp = new Date().toISOString();
  await appendLog(
    paths,
    `ingest: processed=${processed} skipped=${skipped} errors=${errors.length}`
  );
  const pending = (await getWikiStatusFilesForBrain(cfg)).map((f) => f.path);
  const suggestedCommitMessage =
    pending.length > 0
      ? `wiki: ingest ${processed} sources — review ${pending.length} file(s) before commit`
      : `wiki: ingest ${processed} sources (no pending wiki diff)`;
  await writeState(paths, {
    lastIngestAt: stamp,
    pendingWikiChanges: pending,
  });
  await writeRun(paths, {
    kind: "ingest",
    ok: errors.length === 0,
    summary: `ingest processed=${processed} skipped=${skipped}`,
    details: {
      errors,
      catalogLines,
      dashBullets,
      pendingWikiPaths: pending,
      pendingCount: pending.length,
      suggestedCommitMessage,
    },
    errors: errors.length ? errors : undefined,
  });

  return { processed, skipped, errors };
}

function mergeExistingPage(
  existingMd: string,
  patch: {
    title: string;
    executiveSummary: string;
    keyPoints: string[];
    relatedLinks: string[];
    sources: string[];
    extraSummary: string;
  }
): string {
  const { content, data } = matter(existingMd);
  const d = data as Record<string, unknown>;
  d.last_updated = new Date().toISOString().slice(0, 10);
  d.sources = patch.sources;
  const newSection = `## Latest synthesis\n${patch.executiveSummary}\n\n### Key points (merge)\n${patch.keyPoints.map((k) => `- ${k}`).join("\n")}\n\n### Related (merge)\n${patch.relatedLinks.map((l) => `- [[${l}]]`).join("\n")}\n`;
  return matter.stringify(`${content.trim()}\n\n${newSection}`, d);
}

async function updateIndexAndDashboard(
  paths: ReturnType<typeof brainPaths>,
  catalogLines: string[],
  dashBullets: string[],
  processed: number
): Promise<void> {
  let index = "";
  try {
    index = await fs.readFile(paths.indexMd, "utf8");
  } catch {
    index = "# Wiki index\n";
  }
  const catalogBlock = [
    `Last ingest: ${new Date().toISOString()} — files touched: ${processed}`,
    ...catalogLines.map((l) => (l.startsWith("-") ? l : `- ${l}`)),
  ].join("\n");
  index = replaceMarkedSection(index, CATALOG_START, CATALOG_END, catalogBlock);
  await fs.writeFile(paths.indexMd, index, "utf8");

  let dash = "";
  try {
    dash = await fs.readFile(paths.dashboardMd, "utf8");
  } catch {
    dash = "# Dashboard\n";
  }
  const activity = [
    `## Recent activity`,
    ...dashBullets.map((b) => (b.startsWith("-") ? b : `- ${b}`)),
  ].join("\n");
  dash = replaceMarkedSection(dash, DASH_ACTIVITY_START, DASH_ACTIVITY_END, activity);
  await fs.writeFile(paths.dashboardMd, dash, "utf8");
}

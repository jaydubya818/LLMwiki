import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import { v4 as uuid } from "uuid";
import type { BrainConfig } from "../config.js";
import { brainPaths, type BrainPaths } from "../paths.js";

export type OpenLoopType =
  | "question"
  | "decision"
  | "follow-up"
  | "risk"
  | "review-needed"
  | "todo";

export type OpenLoopStatus = "open" | "in-progress" | "resolved" | "ignored";

export interface OpenLoopItem {
  id: string;
  title: string;
  sourcePath: string;
  sourceType: "wiki" | "output" | "video" | "other";
  domain: string;
  loopType: OpenLoopType;
  createdAt: string;
  updatedAt: string;
  status: OpenLoopStatus;
  priority?: "low" | "medium" | "high";
  excerpt: string;
}

export interface OpenLoopsFile {
  version: 1;
  updatedAt: string;
  items: OpenLoopItem[];
}

const PATTERNS: Array<{ re: RegExp; loopType: OpenLoopType; pri?: OpenLoopItem["priority"] }> = [
  { re: /(?:^|\n)\s*(?:open questions?|questions?\s*:|#\s*open)/i, loopType: "question", pri: "medium" },
  { re: /(?:^|\n)\s*(?:next steps?|follow[- ]?ups?|action items?)[:]\s*/i, loopType: "follow-up", pri: "medium" },
  { re: /(?:^|\n)\s*(?:TODO|FIXME|TBD)\s*[:-]?\s*(.+)/i, loopType: "todo", pri: "low" },
  { re: /(?:unresolved|pending decision|decision needed)/i, loopType: "decision", pri: "high" },
  { re: /(?:risk:|open risk|key risk)/i, loopType: "risk", pri: "high" },
  { re: /(?:needs review|review needed)/i, loopType: "review-needed", pri: "medium" },
];

export async function readOpenLoops(paths: BrainPaths): Promise<OpenLoopsFile> {
  try {
    const raw = await fs.readFile(paths.openLoopsJson, "utf8");
    return JSON.parse(raw) as OpenLoopsFile;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), items: [] };
  }
}

export async function writeOpenLoops(paths: BrainPaths, f: OpenLoopsFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.openLoopsJson), { recursive: true });
  const updatedAt = f.updatedAt?.trim() ? f.updatedAt : new Date().toISOString();
  await fs.writeFile(
    paths.openLoopsJson,
    JSON.stringify({ ...f, updatedAt }, null, 2),
    "utf8"
  );
}

export async function updateOpenLoop(
  paths: BrainPaths,
  id: string,
  patch: Partial<Pick<OpenLoopItem, "status" | "priority">>
): Promise<OpenLoopItem | null> {
  const f = await readOpenLoops(paths);
  const idx = f.items.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  f.items[idx] = {
    ...f.items[idx]!,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await writeOpenLoops(paths, f);
  return f.items[idx]!;
}

function classifyLine(line: string): { loopType: OpenLoopType; priority?: OpenLoopItem["priority"] } | null {
  for (const p of PATTERNS) {
    if (p.re.test(line)) {
      return { loopType: p.loopType, priority: p.pri };
    }
  }
  return null;
}

export async function scanOpenLoops(
  cfg: BrainConfig,
  options: { maxItems?: number } = {}
): Promise<OpenLoopsFile> {
  const paths = brainPaths(cfg.root);
  const max = options.maxItems ?? 80;
  const items: OpenLoopItem[] = [];
  const seen = new Set<string>();

  const scanFile = async (abs: string, sourceType: OpenLoopItem["sourceType"]) => {
    const rel = path.relative(cfg.root, abs).split(path.sep).join("/");
    const parts = rel.split("/");
    const domain = parts[1] ?? "topics";
    const raw = await fs.readFile(abs, "utf8");
    const text = sourceType === "wiki" ? matter(raw).content : raw;
    const lines = text.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 8 || trimmed.length > 400) continue;
      const cl = classifyLine(trimmed);
      if (!cl) continue;
      const key = `${rel}::${trimmed.slice(0, 120)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        id: uuid(),
        title: trimmed.replace(/^[-*]\s+/, "").slice(0, 140),
        sourcePath: rel,
        sourceType,
        domain,
        loopType: cl.loopType,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "open",
        priority: cl.priority,
        excerpt: trimmed,
      });
      if (items.length >= max) return;
    }
  };

  for (const abs of await fg(path.join(paths.wiki, "**/*.md").replace(/\\/g, "/"), {
    onlyFiles: true,
  })) {
    await scanFile(abs, "wiki");
    if (items.length >= max) break;
  }
  if (items.length < max) {
    for (const abs of await fg(path.join(paths.outputs, "**/*.md").replace(/\\/g, "/"), {
      onlyFiles: true,
    })) {
      await scanFile(abs, "output");
      if (items.length >= max) break;
    }
  }

  const prev = await readOpenLoops(paths);
  const closed = prev.items.filter((i) => i.status === "resolved" || i.status === "ignored");
  const closedKeys = new Set(closed.map((c) => `${c.sourcePath}\n${c.excerpt}`));

  const merged: OpenLoopItem[] = [...closed];
  for (const it of items) {
    const k = `${it.sourcePath}\n${it.excerpt}`;
    if (closedKeys.has(k)) continue;
    const openOld = prev.items.find(
      (p) => p.status === "open" && p.sourcePath === it.sourcePath && p.excerpt === it.excerpt
    );
    if (openOld) merged.push(openOld);
    else merged.push(it);
  }
  for (const p of prev.items) {
    if (p.status === "in-progress" && !merged.some((m) => m.id === p.id)) merged.push(p);
  }

  const file: OpenLoopsFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: merged.slice(0, max + closed.length + 20),
  };
  await writeOpenLoops(paths, file);
  return file;
}

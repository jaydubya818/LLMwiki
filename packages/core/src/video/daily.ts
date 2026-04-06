import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import type { BrainConfig } from "../config.js";
import { brainPaths } from "../paths.js";
import { createLlm } from "../llm/factory.js";
import { appendLog } from "../log-append.js";
import { writeRun } from "../runs.js";

export async function runDailyVideo(cfg: BrainConfig): Promise<{
  scriptPath: string;
  videoUrl?: string;
}> {
  const paths = brainPaths(cfg.root);
  const wikiPattern = path.join(paths.wiki, "**/*.md").replace(/\\/g, "/");
  const files = await fg(wikiPattern, { onlyFiles: true });
  const now = Date.now();
  const day = 86400000;

  let best: { rel: string; score: number; title: string } | null = null;
  for (const abs of files) {
    const rel = path.relative(cfg.root, abs).split(path.sep).join("/");
    const stat = await fs.stat(abs);
    const recent = now - stat.mtimeMs < day * 2;
    const raw = await fs.readFile(abs, "utf8");
    const { data } = matter(raw);
    const title = (data as { title?: string }).title ?? path.basename(abs, ".md");
    let score = recent ? 3 : 1;
    if (rel.includes("/topics/") || rel.includes("/projects/")) score += 1;
    if ((data as { domain?: string }).domain === "work") score += 0.5;
    if (!best || score > best.score) {
      best = { rel, score, title };
    }
  }

  const avoided = await loadRecentTopics(paths.dailyVideosMd);
  if (best && avoided.has(slug(best.title))) {
    best = null;
  }

  const fallbackTitle =
    best?.title ?? "Second brain maintenance: linking ideas across work and life";
  const fallbackRef = best?.rel ?? "wiki/dashboard.md";

  const llm = createLlm(cfg);
  const script = llm
    ? await llm.completeText(
        "Write a ~150 word first-person video script: curious, direct, no hype. End with one reflective question.",
        `Focus topic: ${fallbackTitle}\nPrimary ref: ${fallbackRef}`
      )
    : [
        "I've been consolidating notes into a living wiki so ideas compound instead of evaporating.",
        `Today's lens: ${fallbackTitle}.`,
        "If you're building a second brain, what's the one concept you wish you'd captured sooner?",
      ].join(" ");

  const scriptsDir = path.join(paths.videos, "scripts");
  await fs.mkdir(scriptsDir, { recursive: true });
  const dayStamp = new Date().toISOString().slice(0, 10);
  const scriptPath = path.join(scriptsDir, `${dayStamp}.md`);
  await fs.writeFile(
    scriptPath,
    ["---", `title: Daily script ${dayStamp}`, "---", "", script, ""].join("\n"),
    "utf8"
  );

  let videoUrl: string | undefined;
  if (cfg.heygenApiKey) {
    videoUrl = await tryHeyGen(script, cfg.heygenApiKey);
  }

  const entry = [
    "",
    `## ${dayStamp} | ${fallbackTitle}`,
    "",
    `**Brief:** ${script.split(/\n+/)[0]?.slice(0, 240)}`,
    "",
    `**Video:** ${videoUrl ?? "pending / not configured"}`,
    "",
    `**Source Pages:** [[${path.basename(fallbackRef, ".md")}]]`,
    "",
  ].join("\n");

  let daily = "";
  try {
    daily = await fs.readFile(paths.dailyVideosMd, "utf8");
  } catch {
    daily = "# Daily videos log\n";
  }
  await fs.writeFile(paths.dailyVideosMd, daily.trimEnd() + entry, "utf8");

  await appendLog(paths, `video: script ${path.relative(cfg.root, scriptPath)}`);
  await writeRun(paths, {
    kind: "video",
    ok: true,
    summary: `daily video script ${dayStamp}`,
    details: { scriptPath: path.relative(cfg.root, scriptPath), videoUrl },
  });

  return { scriptPath, videoUrl };
}

async function loadRecentTopics(dailyMd: string): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(dailyMd, "utf8");
    const set = new Set<string>();
    const re = /^##\s+(\d{4}-\d{2}-\d{2})\s+\|\s+(.+)/gm;
    let m: RegExpExecArray | null;
    const cutoff = Date.now() - 7 * 86400000;
    while ((m = re.exec(raw)) !== null) {
      const d = Date.parse(`${m[1]}T00:00:00Z`);
      if (d >= cutoff) set.add(slug(m[2]));
    }
    return set;
  } catch {
    return new Set();
  }
}

function slug(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function tryHeyGen(script: string, apiKey: string): Promise<string | undefined> {
  const base = process.env.HEYGEN_API_BASE ?? "https://api.heygen.com/v2";
  try {
    const res = await fetch(`${base}/video/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        video_inputs: [{ character: { type: "avatar" }, voice: { type: "text", text: script } }],
      }),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { data?: { video_id?: string } };
    const id = data?.data?.video_id;
    if (!id) return undefined;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const st = await fetch(`${base}/video_status.get?video_id=${id}`, {
        headers: { "X-Api-Key": apiKey },
      });
      if (st.ok) {
        const js = (await st.json()) as { data?: { video_url?: string; status?: string } };
        if (js.data?.video_url) return js.data.video_url;
        if (js.data?.status === "failed") return undefined;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

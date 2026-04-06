import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { BrainPaths } from "../paths.js";
import { brainPaths } from "../paths.js";
import type { BrainConfig } from "../config.js";
import { readOpenLoops } from "../trust/open-loops.js";
import { readDecisionLedger } from "../trust/decision-ledger.js";
import { readReviewPriority } from "../trust/review-priority.js";
import { readSynthesisHeatmap } from "../trust/synthesis-heatmap.js";

export type StrategicThemeStatus = "active" | "emerging" | "fading" | "retired";

export interface StrategicTheme {
  id: string;
  title: string;
  description: string;
  relatedPages: string[];
  relatedDecisions: string[];
  relatedOutputs: string[];
  relatedDomains: string[];
  recurrenceNotes: string[];
  firstSeen: string;
  lastSeen: string;
  status: StrategicThemeStatus;
  /** 1–10 coarse signal strength this refresh */
  signalStrength: number;
}

export interface StrategicThemesFile {
  version: 1;
  updatedAt: string;
  themes: StrategicTheme[];
}

const STOP = new Set([
  "that",
  "this",
  "with",
  "from",
  "your",
  "have",
  "will",
  "what",
  "when",
  "need",
  "review",
  "page",
  "wiki",
  "open",
  "loop",
  "decision",
  "about",
  "their",
  "there",
  "which",
  "where",
  "being",
  "these",
  "those",
  "would",
  "could",
  "should",
  "still",
]);

export async function readStrategicThemes(paths: BrainPaths): Promise<StrategicThemesFile | null> {
  try {
    const raw = await fs.readFile(paths.strategicThemesJson, "utf8");
    return JSON.parse(raw) as StrategicThemesFile;
  } catch {
    return null;
  }
}

export async function writeStrategicThemes(paths: BrainPaths, f: StrategicThemesFile): Promise<void> {
  await fs.mkdir(path.dirname(paths.strategicThemesJson), { recursive: true });
  await fs.writeFile(
    paths.strategicThemesJson,
    JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

function domainOfWikiPath(p: string): string | null {
  const m = /^wiki\/([^/]+)/.exec(p);
  return m ? m[1]! : null;
}

function themeId(seed: string): string {
  return `theme-${crypto.createHash("sha1").update(seed).digest("hex").slice(0, 10)}`;
}

/**
 * Lightweight recurrence detector across loops, decisions, and review queue — not semantic clustering.
 */
export async function buildStrategicThemes(cfg: BrainConfig): Promise<StrategicThemesFile> {
  const paths = brainPaths(cfg.root);
  const loops = await readOpenLoops(paths);
  const ledger = await readDecisionLedger(paths);
  const pri = await readReviewPriority(paths);
  const heat = await readSynthesisHeatmap(paths);

  const wordFreq = new Map<string, number>();
  const wordToPaths = new Map<string, Set<string>>();
  const wordToDecisions = new Map<string, Set<string>>();
  const domainFreq = new Map<string, number>();
  const domainPaths = new Map<string, Set<string>>();

  for (const l of loops.items) {
    if (l.status !== "open") continue;
    for (const w of tokenize(`${l.title} ${l.excerpt ?? ""}`)) {
      wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
      if (l.sourcePath.startsWith("wiki/")) {
        let s = wordToPaths.get(w);
        if (!s) {
          s = new Set();
          wordToPaths.set(w, s);
        }
        s.add(l.sourcePath);
      }
    }
    if (l.sourcePath.startsWith("wiki/")) {
      const d = domainOfWikiPath(l.sourcePath);
      if (d) {
        domainFreq.set(d, (domainFreq.get(d) ?? 0) + 1);
        let s = domainPaths.get(d);
        if (!s) {
          s = new Set();
          domainPaths.set(d, s);
        }
        s.add(l.sourcePath);
      }
    }
  }

  for (const de of ledger.decisions) {
    for (const w of tokenize(`${de.title} ${de.context ?? ""} ${de.decision ?? ""}`)) {
      wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
      let s = wordToDecisions.get(w);
      if (!s) {
        s = new Set();
        wordToDecisions.set(w, s);
      }
      s.add(de.wikiPath);
    }
  }

  for (const row of (pri?.queue ?? []).slice(0, 40)) {
    const d = domainOfWikiPath(row.path);
    if (d) {
      domainFreq.set(d, (domainFreq.get(d) ?? 0) + 2);
      let s = domainPaths.get(d);
      if (!s) {
        s = new Set();
        domainPaths.set(d, s);
      }
      s.add(row.path);
    }
  }

  for (const cell of heat?.cells ?? []) {
    domainFreq.set(cell.domain, (domainFreq.get(cell.domain) ?? 0) + 1);
  }

  const nowIso = new Date().toISOString();
  const prev = await readStrategicThemes(paths);
  const prevById = new Map((prev?.themes ?? []).map((t) => [t.id, t]));

  const themes: StrategicTheme[] = [];
  const seeds: { kind: "word" | "domain"; key: string; strength: number }[] = [];

  for (const [w, n] of wordFreq) {
    if (n >= 3) seeds.push({ kind: "word", key: w, strength: Math.min(10, n) });
  }
  for (const [d, n] of domainFreq) {
    if (n >= 4 && d !== "decisions") seeds.push({ kind: "domain", key: d, strength: Math.min(10, Math.floor(n / 2)) });
  }

  seeds.sort((a, b) => b.strength - a.strength);
  const used = new Set<string>();

  for (const s of seeds.slice(0, 14)) {
    const seed = `${s.kind}:${s.key}`;
    if (used.has(seed)) continue;
    used.add(seed);

    const id = themeId(seed);
    const title =
      s.kind === "domain" ? `${s.key} — recurring domain activity` : `Theme: “${s.key}”`;
    const relatedPages: string[] = Array.from<string>(
      s.kind === "domain"
        ? domainPaths.get(s.key) ?? new Set<string>()
        : wordToPaths.get(s.key) ?? new Set<string>()
    ).slice(0, 24);
    const relatedDecisions = Array.from(wordToDecisions.get(s.key) ?? []).slice(0, 12);
    const relatedDomains =
      s.kind === "domain"
        ? [s.key]
        : Array.from(
            new Set(
              relatedPages.flatMap((p) => {
                const dom = domainOfWikiPath(p);
                return dom ? [dom] : [];
              })
            )
          ).slice(0, 8);

    const recurrenceNotes: string[] = [];
    if (s.kind === "word") recurrenceNotes.push(`Token “${s.key}” appears ${wordFreq.get(s.key) ?? 0}× across open loops + decisions (rough).`);
    else recurrenceNotes.push(`Domain “${s.key}” scored ${domainFreq.get(s.key) ?? 0} recurrence points this refresh.`);

    const old = prevById.get(id);
    const firstSeen = old?.firstSeen ?? nowIso;
    let status: StrategicThemeStatus = "active";
    const daysSince = old
      ? (Date.now() - Date.parse(old.lastSeen)) / 86400000
      : 0;
    if (old && daysSince > 200 && s.strength < 3) status = "retired";
    else if (old && daysSince > 120 && s.strength < 4) status = "fading";
    else if (!old && s.strength <= 4) status = "emerging";

    themes.push({
      id,
      title,
      description: `Advisory theme from local recurrence heuristics — not a semantic “truth” cluster. Strength ${s.strength}/10.`,
      relatedPages,
      relatedDecisions,
      relatedOutputs: [],
      relatedDomains,
      recurrenceNotes,
      firstSeen,
      lastSeen: nowIso,
      status,
      signalStrength: s.strength,
    });
  }

  const file: StrategicThemesFile = { version: 1, updatedAt: nowIso, themes };
  await writeStrategicThemes(paths, file);

  const workDir = path.join(cfg.root, "wiki", "work");
  try {
    await fs.mkdir(workDir, { recursive: true });
    const mdLines = [
      "---",
      "title: Strategic themes (auto-summary)",
      "tags: [governance, themes]",
      `generated: ${nowIso}`,
      "---",
      "",
      "_Heuristic recurrence view — see `.brain/strategic-themes.json` for machine-readable rows._",
      "",
      "## Active / emerging",
      ...themes
        .filter((t) => t.status === "active" || t.status === "emerging")
        .map((t) => `### ${t.title}\n- **Strength:** ${t.signalStrength}/10\n- ${t.recurrenceNotes[0] ?? ""}\n`),
      "",
      "## Fading / retired",
      ...themes
        .filter((t) => t.status === "fading" || t.status === "retired")
        .map((t) => `- **${t.title}** (${t.status})`),
      "",
    ];
    await fs.writeFile(path.join(workDir, "strategic-themes.md"), mdLines.join("\n"), "utf8");
  } catch {
    /* optional wiki mirror */
  }

  return file;
}

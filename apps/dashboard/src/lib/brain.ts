import path from "node:path";
import fs from "node:fs/promises";
import {
  resolveBrainConfig,
  applyEnvToConfig,
  type BrainConfig,
} from "@second-brain/core";
import dotenv from "dotenv";

let cached: { key: string; cfg: BrainConfig } | null = null;

function cacheKey(): string {
  return [
    process.env.SECOND_BRAIN_WORKSPACE ?? "",
    process.env.SECOND_BRAIN_ROOT ?? "",
    process.env.SECOND_BRAIN_NAME ?? "",
    process.env.SECOND_BRAIN_VAULT_NAME ?? "",
  ].join("\u241e");
}

/**
 * Resolve the active brain for API routes (multi-brain workspace or legacy root).
 * Loads repo-root `.env` then `<brain>/.env` and merges into config.
 */
export async function getServerBrainConfig(): Promise<BrainConfig> {
  const k = cacheKey();
  if (cached?.key === k) return cached.cfg;

  dotenv.config();
  const base = await resolveBrainConfig({
    explicitBrainRoot: process.env.SECOND_BRAIN_ROOT,
    workspaceRoot: process.env.SECOND_BRAIN_WORKSPACE,
    brainName: process.env.SECOND_BRAIN_NAME,
  });
  dotenv.config({ path: path.join(base.root, ".env") });
  const cfg = applyEnvToConfig(base);
  cached = { key: cacheKey(), cfg };
  return cfg;
}

export function getWorkspaceRootFromEnv(): string | undefined {
  const raw = process.env.SECOND_BRAIN_WORKSPACE;
  return raw ? path.resolve(raw) : undefined;
}

export function obsidianUri(vaultName: string, relPath: string): string {
  const encoded = encodeURIComponent(relPath.replace(/\\/g, "/"));
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encoded}`;
}

export async function readTail(file: string, max = 8000): Promise<string> {
  try {
    const buf = await fs.readFile(file, "utf8");
    return buf.slice(-max);
  } catch {
    return "";
  }
}

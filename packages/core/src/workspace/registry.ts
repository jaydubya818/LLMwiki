import fs from "node:fs/promises";
import path from "node:path";
import type { ActiveBrainState, BrainRegistry, BrainRegistryEntry } from "./types.js";
import {
  activeBrainPath,
  registryPath,
  settingsPath,
  brainsDir,
} from "./paths.js";
import type { WorkspaceSettings } from "./types.js";

const defaultRegistry = (): BrainRegistry => ({ version: 1, brains: [] });

export async function readRegistry(workspaceRoot: string): Promise<BrainRegistry> {
  try {
    const raw = await fs.readFile(registryPath(workspaceRoot), "utf8");
    return JSON.parse(raw) as BrainRegistry;
  } catch {
    return defaultRegistry();
  }
}

export async function writeRegistry(
  workspaceRoot: string,
  reg: BrainRegistry
): Promise<void> {
  await fs.mkdir(path.dirname(registryPath(workspaceRoot)), { recursive: true });
  await fs.writeFile(registryPath(workspaceRoot), JSON.stringify(reg, null, 2), "utf8");
}

export async function upsertBrainEntry(
  workspaceRoot: string,
  entry: BrainRegistryEntry
): Promise<BrainRegistry> {
  const reg = await readRegistry(workspaceRoot);
  const idx = reg.brains.findIndex((b) => b.name === entry.name);
  if (idx >= 0) reg.brains[idx] = entry;
  else reg.brains.push(entry);
  await writeRegistry(workspaceRoot, reg);
  return reg;
}

export async function readActiveBrain(
  workspaceRoot: string
): Promise<ActiveBrainState | null> {
  try {
    const raw = await fs.readFile(activeBrainPath(workspaceRoot), "utf8");
    return JSON.parse(raw) as ActiveBrainState;
  } catch {
    return null;
  }
}

export async function writeActiveBrain(
  workspaceRoot: string,
  name: string
): Promise<void> {
  await fs.mkdir(path.dirname(activeBrainPath(workspaceRoot)), { recursive: true });
  const st: ActiveBrainState = {
    name,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(activeBrainPath(workspaceRoot), JSON.stringify(st, null, 2), "utf8");
}

export async function readWorkspaceSettings(
  workspaceRoot: string
): Promise<WorkspaceSettings> {
  try {
    const raw = await fs.readFile(settingsPath(workspaceRoot), "utf8");
    return { version: 1, defaultMasterName: "master", ...JSON.parse(raw) };
  } catch {
    return {
      version: 1,
      defaultMasterName: "master",
      promotion: { requireReview: true },
    };
  }
}

export async function writeWorkspaceSettings(
  workspaceRoot: string,
  s: WorkspaceSettings
): Promise<void> {
  await fs.mkdir(path.dirname(settingsPath(workspaceRoot)), { recursive: true });
  await fs.writeFile(settingsPath(workspaceRoot), JSON.stringify(s, null, 2), "utf8");
}

export async function findBrainEntry(
  workspaceRoot: string,
  name: string
): Promise<BrainRegistryEntry | null> {
  const reg = await readRegistry(workspaceRoot);
  return reg.brains.find((b) => b.name === name) ?? null;
}

export function resolveBrainRootAbsolute(
  workspaceRoot: string,
  entry: BrainRegistryEntry
): string {
  return path.resolve(workspaceRoot, ...entry.path.split("/"));
}

export async function listBrainsOnDisk(workspaceRoot: string): Promise<string[]> {
  const out: string[] = [];
  const root = brainsDir(workspaceRoot);
  const master = path.join(root, "master");
  try {
    await fs.access(master);
    out.push("master");
  } catch {
    /* */
  }
  const agents = path.join(root, "agents");
  try {
    const names = await fs.readdir(agents, { withFileTypes: true });
    for (const d of names) {
      if (d.isDirectory()) out.push(d.name);
    }
  } catch {
    /* */
  }
  return out;
}

import path from "node:path";
import { loadConfig, resolveVaultNaming, type BrainConfig } from "../config.js";
import {
  readActiveBrain,
  findBrainEntry,
  resolveBrainRootAbsolute,
  readWorkspaceSettings,
} from "./registry.js";

export interface ResolveBrainOptions {
  /** Direct brain folder (legacy single-brain mode) */
  explicitBrainRoot?: string;
  /** Workspace root containing brains/ */
  workspaceRoot?: string;
  /** Brain name inside workspace (master, coding-agent, …) */
  brainName?: string;
}

export async function resolveBrainConfig(
  opts: ResolveBrainOptions
): Promise<BrainConfig> {
  if (opts.explicitBrainRoot) {
    const r = path.resolve(opts.explicitBrainRoot);
    return resolveVaultNaming(loadConfig(r));
  }

  const ws =
    opts.workspaceRoot ??
    (process.env.SECOND_BRAIN_WORKSPACE
      ? path.resolve(process.env.SECOND_BRAIN_WORKSPACE)
      : undefined);

  if (ws) {
    const settings = await readWorkspaceSettings(ws);
    const active = await readActiveBrain(ws);
    const name =
      opts.brainName ??
      process.env.SECOND_BRAIN_NAME ??
      active?.name ??
      settings.defaultMasterName;

    const entry = await findBrainEntry(ws, name);
    if (!entry) {
      throw new Error(
        `Brain "${name}" not in registry. Run \`brain list\` and \`brain create agent …\`.`
      );
    }

    const brainRoot = resolveBrainRootAbsolute(ws, entry);
    const wikiGitPrefix = `${entry.path}/wiki`.replace(/\\/g, "/").replace(/\/$/, "");
    return resolveVaultNaming(
      loadConfig(brainRoot, {
        gitRoot: ws,
        wikiGitPrefix,
        brainName: entry.name,
        workspaceRoot: ws,
      })
    );
  }

  const legacy = process.env.SECOND_BRAIN_ROOT;
  if (!legacy) {
    throw new Error(
      "Set SECOND_BRAIN_ROOT (single brain) or SECOND_BRAIN_WORKSPACE (multi-brain), or pass --root / --workspace."
    );
  }
  return resolveVaultNaming(loadConfig(path.resolve(legacy)));
}

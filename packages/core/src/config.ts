import path from "node:path";

export interface BrainConfig {
  /** Absolute path to this brain instance (raw/, wiki/, …) */
  root: string;
  /** Git repository root (workspace root in multi-brain mode) */
  gitRoot: string;
  /** Path prefix inside the repo for this brain’s wiki/, posix slashes, no trailing slash */
  wikiGitPrefix: string;
  /** Logical brain name */
  brainName: string;
  /** Workspace root when using brains/master | brains/agents/* layout */
  workspaceRoot?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  heygenApiKey?: string;
  dashboardPort?: number;
}

export type BrainConfigOverrides = Partial<
  Pick<BrainConfig, "gitRoot" | "wikiGitPrefix" | "brainName" | "workspaceRoot">
>;

/** @deprecated use resolveBrainConfig from workspace/resolve.js for workspace mode */
export function resolveBrainRoot(explicit?: string): string {
  const fromEnv = process.env.SECOND_BRAIN_ROOT;
  const raw = explicit ?? fromEnv;
  if (!raw) {
    throw new Error(
      "Brain root not set. Pass --root, set SECOND_BRAIN_ROOT or SECOND_BRAIN_WORKSPACE, or run `brain workspace init`."
    );
  }
  return path.resolve(raw);
}

export function loadConfig(
  brainRoot: string,
  overrides?: BrainConfigOverrides
): BrainConfig {
  const r = path.resolve(brainRoot);
  const gitRoot = path.resolve(overrides?.gitRoot ?? r);
  const wikiGitPrefix = (overrides?.wikiGitPrefix ?? "wiki")
    .replace(/\\/g, "/")
    .replace(/\/$/, "");
  return {
    root: r,
    gitRoot,
    wikiGitPrefix,
    brainName: overrides?.brainName ?? "default",
    workspaceRoot: overrides?.workspaceRoot
      ? path.resolve(overrides.workspaceRoot)
      : undefined,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    heygenApiKey: process.env.HEYGEN_API_KEY,
    dashboardPort: process.env.DASHBOARD_PORT
      ? Number(process.env.DASHBOARD_PORT)
      : 3847,
  };
}

/** Re-apply process.env after loading a brain-specific `.env`. */
export function applyEnvToConfig(cfg: BrainConfig): BrainConfig {
  return {
    ...cfg,
    openaiApiKey: process.env.OPENAI_API_KEY ?? cfg.openaiApiKey,
    openaiBaseUrl:
      process.env.OPENAI_BASE_URL ?? cfg.openaiBaseUrl ?? "https://api.openai.com/v1",
    openaiModel: process.env.OPENAI_MODEL ?? cfg.openaiModel ?? "gpt-4o-mini",
    heygenApiKey: process.env.HEYGEN_API_KEY ?? cfg.heygenApiKey,
    dashboardPort: process.env.DASHBOARD_PORT
      ? Number(process.env.DASHBOARD_PORT)
      : cfg.dashboardPort,
  };
}

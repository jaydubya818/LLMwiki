import fs from "node:fs/promises";
import path from "node:path";
import { ensureGitRepo } from "../git/service.js";
import { scaffoldBrain } from "../scaffold.js";
import type { BrainRegistryEntry, BrainTemplateId } from "./types.js";
import {
  brainsDir,
  workspaceMetaDir,
  masterBrainRelPath,
  agentBrainRelPath,
} from "./paths.js";
import {
  readRegistry,
  upsertBrainEntry,
  writeActiveBrain,
  writeRegistry,
  writeWorkspaceSettings,
  readWorkspaceSettings,
} from "./registry.js";
import { getClaudeTemplate } from "./claude-templates.js";

export async function initWorkspace(workspaceRoot: string): Promise<void> {
  const root = path.resolve(workspaceRoot);
  await fs.mkdir(workspaceMetaDir(root), { recursive: true });
  await fs.mkdir(brainsDir(root), { recursive: true });
  await fs.mkdir(path.join(brainsDir(root), "agents"), { recursive: true });

  const reg = await readRegistry(root);
  if (reg.brains.length === 0) {
    await writeRegistry(root, { version: 1, brains: [] });
  }

  const settings = await readWorkspaceSettings(root);
  await writeWorkspaceSettings(root, {
    ...settings,
    version: 1,
    defaultMasterName: settings.defaultMasterName ?? "master",
    promotion: settings.promotion ?? { requireReview: true },
  });

  await fs.writeFile(
    path.join(root, ".gitignore"),
    ".env\n**/.brain/search-index.json\n**/.brain/graph.json\nnode_modules\n.DS_Store\n",
    "utf8"
  );

  await ensureGitRepo(root);
  await fs.writeFile(
    path.join(root, "README.md"),
    [
      "# Brain workspace",
      "",
      "Layout:",
      "- brains/master/ — personal master",
      "- brains/agents/<name>/ — specialized agent brains",
      "",
      "CLI: brain workspace init | brain create master | brain create agent <n> --template <t> | brain use <n>",
      "",
    ].join("\n"),
    "utf8"
  );
}

export async function createMasterBrain(workspaceRoot: string): Promise<string> {
  const root = path.resolve(workspaceRoot);
  const rel = masterBrainRelPath();
  const abs = path.join(root, rel.split("/").join(path.sep));
  await scaffoldBrain(abs, {
    skipGit: true,
    claudeMarkdown: getClaudeTemplate("master"),
  });
  const entry: BrainRegistryEntry = {
    name: "master",
    type: "master",
    path: rel,
    createdAt: new Date().toISOString(),
  };
  await upsertBrainEntry(root, entry);
  await writeActiveBrain(root, "master");
  await ensureGitRepo(root);
  return abs;
}

export async function createAgentBrain(
  workspaceRoot: string,
  name: string,
  template: BrainTemplateId
): Promise<string> {
  if (name === "master" || name.includes("/") || name.includes("..")) {
    throw new Error("Invalid agent name");
  }
  const root = path.resolve(workspaceRoot);
  const rel = agentBrainRelPath(name);
  const abs = path.join(root, ...rel.split("/"));
  if (template === "master") {
    throw new Error('Agent brains cannot use template "master"; use brain create master');
  }
  const claude = getClaudeTemplate(template);
  await scaffoldBrain(abs, { skipGit: true, claudeMarkdown: claude });
  const entry: BrainRegistryEntry = {
    name,
    type: template,
    path: rel,
    createdAt: new Date().toISOString(),
  };
  await upsertBrainEntry(root, entry);
  await ensureGitRepo(root);
  return abs;
}

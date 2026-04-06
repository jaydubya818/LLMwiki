import path from "node:path";

export function workspaceMetaDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".workspace");
}

export function registryPath(workspaceRoot: string): string {
  return path.join(workspaceMetaDir(workspaceRoot), "registry.json");
}

export function activeBrainPath(workspaceRoot: string): string {
  return path.join(workspaceMetaDir(workspaceRoot), "active-brain.json");
}

export function settingsPath(workspaceRoot: string): string {
  return path.join(workspaceMetaDir(workspaceRoot), "settings.json");
}

export function brainsDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, "brains");
}

export function masterBrainRelPath(): string {
  return "brains/master";
}

export function agentBrainRelPath(agentName: string): string {
  return `brains/agents/${agentName}`;
}

export function promotionQueuePath(brainRoot: string): string {
  return path.join(brainRoot, ".brain", "promotion-candidates.json");
}

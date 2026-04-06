export type BrainTemplateId =
  | "master"
  | "coding-agent"
  | "strategy-agent"
  | "research-agent"
  | "leadership-agent";

export interface BrainRegistryEntry {
  name: string;
  type: BrainTemplateId;
  /** Relative to workspace root, posix separators, e.g. brains/master or brains/agents/foo */
  path: string;
  createdAt: string;
}

export interface BrainRegistry {
  version: 1;
  brains: BrainRegistryEntry[];
}

export interface ActiveBrainState {
  name: string;
  updatedAt: string;
}

export interface WorkspaceSettings {
  version: 1;
  defaultMasterName: string;
  promotion?: {
    requireReview: boolean;
  };
  /** Optional shared LLM overrides (brain .env still wins if set in process) */
  shared?: {
    openaiModel?: string;
  };
}

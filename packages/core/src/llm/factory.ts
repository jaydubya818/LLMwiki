import type { BrainConfig } from "../config.js";
import type { LlmClient } from "./types.js";
import { createOpenAiClient } from "./openai.js";

export function createLlm(cfg: BrainConfig): LlmClient | null {
  return createOpenAiClient(cfg);
}

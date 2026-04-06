import type { BrainConfig } from "../config.js";
import type { LlmClient } from "./types.js";

export function createOpenAiClient(cfg: BrainConfig): LlmClient | null {
  if (!cfg.openaiApiKey) return null;
  const base = cfg.openaiBaseUrl ?? "https://api.openai.com/v1";
  const model = cfg.openaiModel ?? "gpt-4o-mini";

  async function chat(messages: Array<{ role: string; content: string }>, opts?: { json?: boolean }): Promise<string> {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        response_format: opts?.json ? { type: "json_object" } : undefined,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI error ${res.status}: ${err}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty LLM response");
    return content;
  }

  return {
    async completeJson<T>(system: string, user: string): Promise<T> {
      const raw = await chat(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { json: true }
      );
      return JSON.parse(raw) as T;
    },
    async completeText(system: string, user: string): Promise<string> {
      return chat([
        { role: "system", content: system },
        { role: "user", content: user },
      ]);
    },
  };
}

import fs from "node:fs/promises";
import type { BrainPaths } from "./paths.js";

export async function appendLog(
  paths: BrainPaths,
  line: string
): Promise<void> {
  const stamp = new Date().toISOString();
  const entry = `- \`${stamp}\` ${line}\n`;
  await fs.appendFile(paths.logMd, entry, "utf8");
}

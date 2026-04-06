import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";

export interface RecentFile {
  path: string;
  mtimeMs: number;
}

/**
 * List markdown files under a directory by recently modified (newest first).
 */
export async function listRecentMarkdown(
  root: string,
  subdir: string,
  limit: number
): Promise<RecentFile[]> {
  const base = path.join(root, subdir);
  const pattern = path.join(base, "**/*.md").replace(/\\/g, "/");
  const files = await fg(pattern, { onlyFiles: true });
  const statd: RecentFile[] = [];
  for (const abs of files) {
    try {
      const st = await fs.stat(abs);
      statd.push({
        path: path.relative(root, abs).split(path.sep).join("/"),
        mtimeMs: st.mtimeMs,
      });
    } catch {
      /* skip */
    }
  }
  statd.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return statd.slice(0, limit);
}

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export interface ExtractedDoc {
  text: string;
  metadata: Record<string, unknown>;
}

async function readUtf8(file: string): Promise<string> {
  return fs.readFile(file, "utf8");
}

export async function extractFromFile(filePath: string): Promise<ExtractedDoc> {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".md":
    case ".markdown": {
      const raw = await readUtf8(filePath);
      const { content, data } = matter(raw);
      return { text: content.trim(), metadata: data as Record<string, unknown> };
    }
    case ".txt":
    case ".csv":
    case ".json": {
      const raw = await readUtf8(filePath);
      return { text: raw, metadata: {} };
    }
    case ".pdf": {
      try {
        const buf = await fs.readFile(filePath);
        const pdfParse = (await import("pdf-parse")).default as (
          b: Buffer
        ) => Promise<{ text: string }>;
        const res = await pdfParse(buf);
        return { text: (res.text ?? "").trim(), metadata: {} };
      } catch {
        return {
          text: `[PDF: ${path.basename(filePath)} — text extraction failed]`,
          metadata: {},
        };
      }
    }
    default:
      return {
        text: `[Unsupported type ${ext} for ${path.basename(filePath)}]`,
        metadata: {},
      };
  }
}

export function extensionSupported(ext: string): boolean {
  return [".md", ".txt", ".csv", ".json", ".pdf"].includes(ext.toLowerCase());
}

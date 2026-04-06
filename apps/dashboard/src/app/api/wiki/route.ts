import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { getServerBrainConfig } from "@/lib/brain";
import matter from "gray-matter";
import { extractWikilinks } from "@second-brain/core/wikilinks";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rel = searchParams.get("path") ?? "";
    const cfg = await getServerBrainConfig();
    const root = cfg.root;
    const safe = rel.replace(/\.\./g, "").replace(/^\//, "");
    const abs = path.join(root, safe);
    if (!abs.startsWith(root)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    const raw = await fs.readFile(abs, "utf8");
    const { content, data } = matter(raw);
    const links = extractWikilinks(content);
    return NextResponse.json({
      path: safe,
      frontmatter: data,
      content,
      wikilinks: links,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 404 });
  }
}

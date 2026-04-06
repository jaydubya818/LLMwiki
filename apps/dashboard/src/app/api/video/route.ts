import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { getServerBrainConfig, readTail } from "@/lib/brain";
import { brainPaths } from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const root = cfg.root;
    const paths = brainPaths(root);
    const daily = await readTail(paths.dailyVideosMd, 12000);
    const scriptsDir = path.join(paths.videos, "scripts");
    const files = await fs.readdir(scriptsDir).catch(() => [] as string[]);
    const latest = files.filter((f) => f.endsWith(".md")).sort().pop();
    let latestScript = "";
    if (latest) {
      latestScript = await fs.readFile(path.join(scriptsDir, latest), "utf8");
    }
    const heygen = process.env.HEYGEN_API_KEY ? "configured" : "not configured";
    return NextResponse.json({ daily, latestScript, latestName: latest, heygen });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

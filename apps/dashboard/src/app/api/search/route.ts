import { NextResponse } from "next/server";
import {
  getServerBrainConfig,
  getWorkspaceRootFromEnv,
} from "@/lib/brain";
import {
  brainPaths,
  loadSearchIndex,
  searchIndex,
  searchAcrossBrains,
} from "@second-brain/core";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? "";
    const scope = searchParams.get("scope") ?? "all";
    const allBrains = searchParams.get("allBrains") === "1";

    const ws = getWorkspaceRootFromEnv();
    if (allBrains && ws) {
      const hits = await searchAcrossBrains(ws, q, 12);
      return NextResponse.json({ mode: "allBrains" as const, hits });
    }

    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const idx = await loadSearchIndex(paths);
    if (!idx) {
      return NextResponse.json({ error: "Index missing" }, { status: 400 });
    }
    let kinds: ("wiki" | "raw" | "output")[] | undefined;
    if (scope === "wiki") kinds = ["wiki"];
    else if (scope === "raw") kinds = ["raw"];
    else if (scope === "output") kinds = ["output"];
    const hits = searchIndex(idx, q, { kinds }, 50);
    return NextResponse.json({
      mode: "single" as const,
      brainName: cfg.brainName,
      hits,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

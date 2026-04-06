import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import {
  brainPaths,
  readSourceLineage,
  getInfluenceForSource,
  readSourceSupersession,
} from "@second-brain/core";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("raw");
    if (!raw || !raw.startsWith("raw/")) {
      return NextResponse.json({ error: "raw= path under raw/ required" }, { status: 400 });
    }
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const lineage = await readSourceLineage(paths);
    const influence = getInfluenceForSource(lineage, raw);
    const norm = raw.replace(/^\//, "").trim();
    const key = norm.startsWith("raw/") ? norm : `raw/${norm}`;
    const supersession = await readSourceSupersession(paths);
    const supersessionHints = supersession.items.filter(
      (i) =>
        i.olderSource.replace(/^\//, "") === key ||
        i.newerSource.replace(/^\//, "") === key
    );
    return NextResponse.json({
      source: key,
      influence: influence ?? { wikiPages: [], outputs: [], decisions: [] },
      stale: !lineage,
      supersessionHints,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

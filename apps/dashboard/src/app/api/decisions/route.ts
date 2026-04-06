import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { parseJsonBody } from "@/lib/api-route-helpers";
import {
  brainPaths,
  readDecisionLedger,
  refreshDecisionLedger,
  filterDecisions,
} from "@second-brain/core";

export async function GET(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get("refresh") === "1";
    let ledger = await readDecisionLedger(paths);
    if (refresh) {
      ledger = await refreshDecisionLedger(cfg);
    }
    const status = searchParams.get("status") ?? undefined;
    const domain = searchParams.get("domain") ?? undefined;
    const search = searchParams.get("q") ?? undefined;
    const decisions = filterDecisions(ledger, { status, domain, search });
    return NextResponse.json({ updatedAt: ledger.updatedAt, decisions, total: ledger.decisions.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const parsed = await parseJsonBody<{ action?: string }>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    if (body.action === "refresh") {
      const ledger = await refreshDecisionLedger(cfg);
      return NextResponse.json({ ok: true, count: ledger.decisions.length });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { requireDashboardApiKey, internalServerError } from "@/lib/api-route-helpers";
import {
  brainPaths,
  readExecutiveTrustSummary,
  refreshExecutiveTrustLayer,
  applyExecutiveActionTelemetryToSummary,
  recordExecutiveTrustActionDone,
  type KnowledgeGraph,
} from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const raw = await readExecutiveTrustSummary(paths);
    if (!raw) {
      return NextResponse.json({ error: "missing — run lint / operational refresh / brain executive-trust" });
    }
    const s = await applyExecutiveActionTelemetryToSummary(paths, raw);
    return NextResponse.json(s);
  } catch (e) {
    return internalServerError(e);
  }
}

export async function POST(req: Request) {
  try {
    const unauthorized = requireDashboardApiKey(req);
    if (unauthorized) return unauthorized;
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    let body: {
      writeMarkdown?: boolean;
      markActionDone?: boolean;
      actionKey?: string;
      targetPath?: string;
      note?: string;
    } = {};
    try {
      body = (await req.json()) as typeof body;
    } catch {
      /* empty or non-JSON body */
    }

    if (body.markActionDone === true && body.actionKey) {
      await recordExecutiveTrustActionDone(paths, {
        actionKey: String(body.actionKey),
        targetPath: body.targetPath ? String(body.targetPath) : undefined,
        rationale: body.note ? String(body.note) : undefined,
      });
      const raw = await readExecutiveTrustSummary(paths);
      const summary = raw ? await applyExecutiveActionTelemetryToSummary(paths, raw) : null;
      return NextResponse.json({ ok: true, summary });
    }

    const writeMarkdown = !!body.writeMarkdown;

    let graph: KnowledgeGraph | null = null;
    try {
      graph = JSON.parse(await fs.readFile(paths.graphJson, "utf8")) as KnowledgeGraph;
    } catch {
      /* optional */
    }

    const r = await refreshExecutiveTrustLayer(cfg, graph, { writeMarkdown });
    const raw = await readExecutiveTrustSummary(paths);
    const summary = raw ? await applyExecutiveActionTelemetryToSummary(paths, raw) : null;
    return NextResponse.json({
      ok: r.errors.length === 0,
      errors: r.errors,
      markdownRel: r.markdownRel,
      summary,
    });
  } catch (e) {
    return internalServerError(e);
  }
}

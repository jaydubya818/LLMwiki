import { NextResponse } from "next/server";
import { getWorkspaceRootFromEnv } from "@/lib/brain";
import {
  gatherPromotionReview,
  promoteBetweenBrains,
} from "@second-brain/core";

export async function GET(req: Request) {
  try {
    const ws = getWorkspaceRootFromEnv();
    if (!ws) {
      return NextResponse.json(
        { error: "Set SECOND_BRAIN_WORKSPACE for promotion workflow." },
        { status: 400 }
      );
    }
    const { searchParams } = new URL(req.url);
    const brain = searchParams.get("brain");
    if (!brain) {
      return NextResponse.json({ error: "Query ?brain=name required" }, { status: 400 });
    }
    const rows = await gatherPromotionReview(ws, brain);
    return NextResponse.json({ brain, rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ws = getWorkspaceRootFromEnv();
    if (!ws) {
      return NextResponse.json(
        { error: "Set SECOND_BRAIN_WORKSPACE for promotion workflow." },
        { status: 400 }
      );
    }
    const body = (await req.json()) as {
      sourceBrain?: string;
      targetBrain?: string;
      relPath?: string;
      rationale?: string;
    };
    if (!body.sourceBrain || !body.targetBrain || !body.relPath) {
      return NextResponse.json(
        { error: "sourceBrain, targetBrain, relPath required" },
        { status: 400 }
      );
    }
    const { destAbs } = await promoteBetweenBrains(
      ws,
      body.sourceBrain,
      body.targetBrain,
      body.relPath,
      { rationale: body.rationale }
    );
    return NextResponse.json({ ok: true, destAbs });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

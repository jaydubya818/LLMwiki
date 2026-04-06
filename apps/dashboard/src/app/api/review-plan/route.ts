import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { buildReviewWorkloadPlans, writeReviewWorkloadMarkdown } from "@second-brain/core";

export async function GET() {
  try {
    const cfg = await getServerBrainConfig();
    const { plans, debtLevel } = await buildReviewWorkloadPlans(cfg);
    return NextResponse.json({ plans, debtLevel });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const body = (await req.json()) as { label?: "10min" | "30min" | "60min"; write?: boolean };
    const { plans } = await buildReviewWorkloadPlans(cfg);
    const label = body.label ?? "10min";
    const plan = plans.find((p) => p.label === label) ?? plans[0];
    if (!plan) return NextResponse.json({ error: "no plan" }, { status: 500 });
    let path: string | undefined;
    if (body.write) {
      path = await writeReviewWorkloadMarkdown(cfg, plan);
    }
    return NextResponse.json({ ok: true, plan, path });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

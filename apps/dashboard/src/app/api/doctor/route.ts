import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import { runDoctor } from "@second-brain/core";

export async function GET() {
  let cfg: Awaited<ReturnType<typeof getServerBrainConfig>> | null = null;
  let err: string | undefined;
  try {
    cfg = await getServerBrainConfig();
  } catch (e) {
    err = (e as Error).message ?? String(e);
  }
  const report = await runDoctor(cfg, err, { saveReport: false });
  return NextResponse.json(report);
}

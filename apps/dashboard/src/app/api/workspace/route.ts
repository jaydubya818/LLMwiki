import { NextResponse } from "next/server";
import {
  getServerBrainConfig,
  getWorkspaceRootFromEnv,
} from "@/lib/brain";
import {
  getWorkspaceStatus,
  gatherPromotionReview,
} from "@second-brain/core";

export async function GET() {
  try {
    const ws = getWorkspaceRootFromEnv();
    if (!ws) {
      const cfg = await getServerBrainConfig();
      return NextResponse.json({
        mode: "single" as const,
        brainName: cfg.brainName,
        root: cfg.root,
      });
    }

    const status = await getWorkspaceStatus(ws, 4);
    const promotionAlerts: { brain: string; count: number }[] = [];
    for (const b of status.brains) {
      if (b.type === "master") continue;
      try {
        const rows = await gatherPromotionReview(ws, b.name);
        if (rows.length > 0) {
          promotionAlerts.push({ brain: b.name, count: rows.length });
        }
      } catch {
        promotionAlerts.push({ brain: b.name, count: 0 });
      }
    }
    return NextResponse.json({
      mode: "workspace" as const,
      ...status,
      promotionAlerts,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

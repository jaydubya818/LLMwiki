import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { getServerBrainConfig } from "@/lib/brain";
import { safeResolveUnderVaultRoot } from "@/lib/safe-repo-path";
import {
  brainPaths,
  readPromotionInbox,
  updateInboxItem,
  promoteInboxItemToWiki,
  addInboxItem,
  ensureInboxMigratedFromLegacy,
  type PromotionInboxStatus,
  type PromotionInboxType,
} from "@second-brain/core";

const PREVIEW_MAX = 12000;

export async function GET(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    await ensureInboxMigratedFromLegacy(cfg.root, paths);
    const inbox = await readPromotionInbox(paths);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    let items = inbox.items;
    if (status) items = items.filter((i) => i.status === status);
    if (type) items = items.filter((i) => i.candidateType === type);
    return NextResponse.json({ items, count: items.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const body = (await req.json()) as {
      action?: string;
      id?: string;
      status?: string;
      sourcePath?: string;
      candidateType?: string;
      rationale?: string;
      suggestedTarget?: string;
      targetWikiRel?: string;
    };

    if (body.action === "add" && body.sourcePath) {
      await ensureInboxMigratedFromLegacy(cfg.root, paths);
      const item = await addInboxItem(paths, {
        sourcePath: body.sourcePath,
        candidateType: (body.candidateType as PromotionInboxType) ?? "other",
        rationale: body.rationale,
        suggestedTarget: body.suggestedTarget,
      });
      return NextResponse.json({ ok: true, item });
    }

    if (body.action === "update" && body.id && body.status) {
      const item = await updateInboxItem(paths, body.id, {
        status: body.status as PromotionInboxStatus,
      });
      return NextResponse.json({ ok: true, item });
    }

    if (body.action === "promote" && body.id) {
      const res = await promoteInboxItemToWiki(cfg, body.id, {
        targetWikiRel: body.targetWikiRel,
      });
      return NextResponse.json({ ok: true, ...res });
    }

    if (body.action === "preview" && body.sourcePath) {
      const resolved = safeResolveUnderVaultRoot(cfg.root, body.sourcePath);
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.reason }, { status: 400 });
      }
      try {
        const st = await fs.stat(resolved.abs);
        if (!st.isFile()) {
          return NextResponse.json({ error: "not a file" }, { status: 400 });
        }
        if (st.size > PREVIEW_MAX * 4) {
          return NextResponse.json({ error: "file too large for preview" }, { status: 400 });
        }
        const raw = await fs.readFile(resolved.abs, "utf8");
        return NextResponse.json({ ok: true, preview: raw.slice(0, PREVIEW_MAX) });
      } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "could not read file" }, { status: 500 });
      }
    }

    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

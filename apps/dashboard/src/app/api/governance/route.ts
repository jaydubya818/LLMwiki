import { NextResponse } from "next/server";
import { getServerBrainConfig } from "@/lib/brain";
import type {
  CanonPromotionSourceType,
  CanonPromotionStatus,
  EvidenceAlertStatus,
} from "@second-brain/core";
import {
  brainPaths,
  refreshOperationalIntelligence,
  readCanonPromotions,
  updateCanonPromotion,
  addCanonPromotion,
  materializeCanonPromotionToProposal,
  readReviewSla,
  readDecisionImpact,
  readEvidenceChangeAlerts,
  updateEvidenceAlertStatus,
  readSnapshotBundles,
  recordPageSnapshot,
  buildSnapshotBundleView,
  renderSnapshotDiffSummaryMd,
  readResolutionQuality,
  readCanonDriftWatchlist,
  readReviewSessionState,
  rebuildReviewSessionQueue,
  advanceReviewSessionCursor,
  writeReviewSessionSummaryMd,
  generateStewardDigestForDomain,
  generateAllStewardDigests,
  generateQuarterlyOperationalReview,
  listStewardDigestFiles,
  listQuarterlyReviewFiles,
  readGovernanceSettings,
  patchGovernanceSettings,
  readCanonAdmission,
  isCanonAdmissionBlocked,
  captureGovernanceIntent,
  readGovernanceActionLog,
  isHighSignalGovernanceContext,
  type HumanOverrideType,
} from "@second-brain/core";
import fs from "node:fs/promises";
import path from "node:path";
import { requireDashboardApiKey } from "@/lib/api-route-helpers";

export async function GET(req: Request) {
  try {
    const unauthorized = requireDashboardApiKey(req);
    if (unauthorized) return unauthorized;
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const { searchParams } = new URL(req.url);
    const bundlePage = searchParams.get("snapshot-bundle");

    const actionLogLimit = Math.min(
      80,
      Math.max(0, parseInt(new URL(req.url).searchParams.get("actionLogLimit") ?? "0", 10) || 0)
    );

    const [
      canon,
      sla,
      impact,
      evidence,
      snapshots,
      resQ,
      watch,
      session,
      stewardList,
      quarterlyList,
      govSettings,
      actionLog,
    ] = await Promise.all([
      readCanonPromotions(paths),
      readReviewSla(paths),
      readDecisionImpact(paths),
      readEvidenceChangeAlerts(paths),
      readSnapshotBundles(paths),
      readResolutionQuality(paths),
      readCanonDriftWatchlist(paths),
      readReviewSessionState(paths),
      listStewardDigestFiles(cfg, 30),
      listQuarterlyReviewFiles(cfg, 15),
      readGovernanceSettings(paths),
      actionLogLimit ? readGovernanceActionLog(paths) : Promise.resolve(null),
    ]);

    let snapshotView = null;
    if (bundlePage) {
      snapshotView = await buildSnapshotBundleView(cfg, bundlePage);
    }

    return NextResponse.json({
      canonPromotions: canon,
      reviewSla: sla,
      decisionImpact: impact,
      evidenceAlerts: evidence,
      snapshotBundles: snapshots,
      snapshotView,
      resolutionQuality: resQ,
      canonDriftWatchlist: watch,
      reviewSession: session,
      stewardDigests: stewardList,
      quarterlyReviews: quarterlyList,
      governanceSettings: govSettings,
      governanceActionLog: actionLogLimit
        ? { ...actionLog!, entries: (actionLog!.entries ?? []).slice(0, actionLogLimit) }
        : null,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const unauthorized = requireDashboardApiKey(req);
    if (unauthorized) return unauthorized;
    const cfg = await getServerBrainConfig();
    const paths = brainPaths(cfg.root);
    const body = (await req.json()) as Record<string, unknown>;
    const action = body.action as string;

    switch (action) {
      case "refresh": {
        const r = await refreshOperationalIntelligence(cfg, {});
        return NextResponse.json({ ok: r.ok, errors: r.errors, wikiPagesScanned: r.wikiPagesScanned });
      }
      case "canon-promotion-add": {
        const rec = await addCanonPromotion(paths, {
          sourceArtifactPath: String(body.sourceArtifactPath ?? ""),
          sourceType: (body.sourceType as CanonPromotionSourceType) ?? "other",
          proposedTargetCanonicalPage: String(body.proposedTargetCanonicalPage ?? ""),
          proposedTargetSection: body.proposedTargetSection as string | undefined,
          rationale: String(body.rationale ?? ""),
          promotionSummary: String(body.promotionSummary ?? ""),
          supportingTraceRefs: body.supportingTraceRefs as string[] | undefined,
          linkedPromotionInboxId: body.linkedPromotionInboxId as string | undefined,
        });
        return NextResponse.json({ ok: true, rec });
      }
      case "governance-settings-patch": {
        const next = await patchGovernanceSettings(paths, {
          autoCaptureOverrides: body.autoCaptureOverrides as boolean | undefined,
          requireRationaleForCanonOverrides: body.requireRationaleForCanonOverrides as boolean | undefined,
          requireSnapshotBeforeCanon: body.requireSnapshotBeforeCanon as boolean | undefined,
          autoSnapshotWhenMissingBeforeCanon: body.autoSnapshotWhenMissingBeforeCanon as boolean | undefined,
          snapshotMaxAgeDaysForCanon: body.snapshotMaxAgeDaysForCanon as number | undefined,
          autoGenerateCouncilMinutes: body.autoGenerateCouncilMinutes as boolean | undefined,
          councilMinutesMode: body.councilMinutesMode as "rolling" | "session" | undefined,
          canonGuardEnabled: body.canonGuardEnabled as boolean | undefined,
          canonGuardHookWarnOnly: body.canonGuardHookWarnOnly as boolean | undefined,
          canonGuardRequireRecentSnapshot: body.canonGuardRequireRecentSnapshot as boolean | undefined,
          canonGuardStrictTrustDelta: body.canonGuardStrictTrustDelta as boolean | undefined,
          installGitHooks: body.installGitHooks as boolean | undefined,
          enablePrePushCanonGuard: body.enablePrePushCanonGuard as boolean | undefined,
          canonGuardPrePushWarnOnly: body.canonGuardPrePushWarnOnly as boolean | undefined,
          installPrePushHook: body.installPrePushHook as boolean | undefined,
          canonGuardIgnorePrefixes: body.canonGuardIgnorePrefixes as string[] | undefined,
          canonGuardIgnorePaths: body.canonGuardIgnorePaths as string[] | undefined,
        });
        return NextResponse.json({ ok: true, governanceSettings: next });
      }
      case "canon-promotion-update": {
        const id = String(body.id ?? "");
        const before = (await readCanonPromotions(paths)).items.find((x) => x.id === id);
        const rationale = String(
          (body.rationale as string) ?? (body.reviewerNote as string) ?? ""
        ).trim();
        const settings = await readGovernanceSettings(paths);
        const newStatus = body.status as CanonPromotionStatus | undefined;

        if (before && newStatus && before.status !== newStatus) {
          const admissionFile = await readCanonAdmission(paths);
          const adm = admissionFile?.records.find(
            (r) => r.targetPage === before.proposedTargetCanonicalPage.replace(/^\//, "")
          );
          const readinessRisk =
            adm &&
            (adm.readinessSummary === "admit_with_warnings" ||
              adm.readinessSummary === "blocked" ||
              isCanonAdmissionBlocked(adm));

          const promoHigh =
            newStatus === "rejected" &&
            isHighSignalGovernanceContext({
              sourceWorkflow: "canon_promotion",
              relatedPath: before.proposedTargetCanonicalPage,
              overrideType: "reject_canon_promotion",
            });
          const approveOverride =
            newStatus === "approved" &&
            !!readinessRisk &&
            settings.requireRationaleForCanonOverrides;
          const rejectNeeds =
            newStatus === "rejected" && settings.requireRationaleForCanonOverrides && promoHigh;

          if ((approveOverride || rejectNeeds) && !rationale) {
            return NextResponse.json(
              { error: "rationale required for this promotion decision", needsRationale: true },
              { status: 400 }
            );
          }
        }

        const rec = await updateCanonPromotion(paths, id, {
          status: newStatus,
          reviewerNote: body.reviewerNote as string | undefined,
          proposedTargetCanonicalPage: body.proposedTargetCanonicalPage as string | undefined,
          promotionSummary: body.promotionSummary as string | undefined,
        });

        if (rec && before && newStatus && before.status !== newStatus) {
          const admissionFile = await readCanonAdmission(paths);
          const adm = admissionFile?.records.find(
            (r) => r.targetPage === rec.proposedTargetCanonicalPage.replace(/^\//, "")
          );

          let overrideType: HumanOverrideType = "other";
          if (rec.status === "rejected") overrideType = "reject_canon_promotion";

          const promoMinutesRaw =
            body.appendCouncilMinutes && typeof body.appendCouncilMinutes === "object"
              ? (body.appendCouncilMinutes as Record<string, unknown>)
              : null;
          const promoMinuteLines: string[] = promoMinutesRaw
            ? Array.isArray(promoMinutesRaw.lines)
              ? (promoMinutesRaw.lines as unknown[]).map((x) => String(x))
              : [
                  `- Promotion \`${rec.id}\` → \`${rec.proposedTargetCanonicalPage}\``,
                  `- ${before.status} → ${rec.status}`,
                ]
            : [];

          const cap = await captureGovernanceIntent(
            cfg,
            {
              relatedPath: rec.proposedTargetCanonicalPage.replace(/^\//, ""),
              overrideType,
              sourceWorkflow: "canon_promotion",
              actionTaken: `promotion_status:${before.status}->${rec.status}`,
              finalHumanDecision: rec.status,
              previousSuggestion: `prior_status=${before.status}; target=${rec.proposedTargetCanonicalPage}`,
              rationale: rationale || undefined,
              autoCaptured: !rationale,
              relatedItemType: "canon_promotion",
              relatedItemId: rec.id,
              linkedSnapshotId: rec.linkedSnapshotId,
              canonAdmissionOverride: rec.status === "approved" && adm ? isCanonAdmissionBlocked(adm) : false,
              appendCouncilMinutes: promoMinutesRaw
                ? {
                    title: String(promoMinutesRaw.title ?? `Canon promotion ${rec.status}`),
                    lines: promoMinuteLines,
                    followUp: promoMinutesRaw.followUp ? String(promoMinutesRaw.followUp) : undefined,
                  }
                : undefined,
              minutesAsSessionFile: body.minutesAsSessionFile === true,
            },
            settings
          );
          return NextResponse.json({
            ok: true,
            rec,
            capture: { overrideId: cap.override?.id, minutesPath: cap.minutesPath },
          });
        }
        return NextResponse.json({ ok: true, rec });
      }
      case "canon-promotion-materialize": {
        try {
          const r = await materializeCanonPromotionToProposal(cfg, String(body.id ?? ""));
          return NextResponse.json({ ok: true, ...r });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.startsWith("SNAPSHOT_REQUIRED:")) {
            return NextResponse.json(
              { error: msg.replace(/^SNAPSHOT_REQUIRED:\s*/, ""), code: "SNAPSHOT_REQUIRED" },
              { status: 409 }
            );
          }
          throw e;
        }
      }
      case "review-session-mark-item": {
        const pathRel = String(body.path ?? "");
        const refType = String(body.refType ?? "review_session");
        const refId = String(body.refId ?? "");
        const rationale = String(body.rationale ?? "").trim();
        const settings = await readGovernanceSettings(paths);
        const minutesRaw =
          body.appendCouncilMinutes && typeof body.appendCouncilMinutes === "object"
            ? (body.appendCouncilMinutes as Record<string, unknown>)
            : null;
        const sessionLines: string[] = minutesRaw
          ? Array.isArray(minutesRaw.lines)
            ? (minutesRaw.lines as unknown[]).map((x) => String(x))
            : [`- ${refType} \`${refId}\``, pathRel ? `- Path: \`${pathRel}\`` : ""].filter(Boolean)
          : [];
        const cap = await captureGovernanceIntent(
          cfg,
          {
            relatedPath: pathRel || refId || "review-session",
            overrideType: "review_session_note",
            sourceWorkflow: "review_session",
            actionTaken: String(body.actionLabel ?? "marked_reviewed"),
            finalHumanDecision: "reviewed",
            rationale,
            autoCaptured: !rationale,
            relatedItemType: refType,
            relatedItemId: refId || undefined,
            appendCouncilMinutes: minutesRaw
              ? {
                  title: String(minutesRaw.title ?? "Review session"),
                  lines: sessionLines,
                }
              : undefined,
            minutesAsSessionFile: body.minutesAsSessionFile === true,
          },
          settings
        );
        if (cap.needsRationale) {
          return NextResponse.json({ error: "rationale required", needsRationale: true }, { status: 400 });
        }
        return NextResponse.json({ ok: true, capture: { overrideId: cap.override?.id, minutesPath: cap.minutesPath } });
      }
      case "evidence-alert-status": {
        await updateEvidenceAlertStatus(
          paths,
          String(body.id ?? ""),
          body.status as EvidenceAlertStatus
        );
        return NextResponse.json({ ok: true });
      }
      case "page-snapshot": {
        const r = await recordPageSnapshot(
          cfg,
          String(body.pagePath ?? ""),
          body.reason as string | undefined,
          body.runId as string | undefined
        );
        return NextResponse.json({ ok: true, ...r });
      }
      case "snapshot-bundle-export": {
        const view = await buildSnapshotBundleView(cfg, String(body.pagePath ?? ""));
        const md = renderSnapshotDiffSummaryMd(view);
        await fs.mkdir(paths.reviewsDir, { recursive: true });
        const stamp = new Date().toISOString();
        const hh = stamp.slice(11, 19).replace(/:/g, "");
        const safe = path.basename(String(body.pagePath ?? "page"), ".md").replace(/[^\w-]+/g, "-");
        const fname = `snapshot-diff-${safe}-${stamp.slice(0, 10)}-${hh}.md`;
        const rel = path.join("outputs", "reviews", fname).split(path.sep).join("/");
        await fs.writeFile(path.join(cfg.root, rel), md, "utf8");
        return NextResponse.json({ ok: true, path: rel });
      }
      case "review-session-rebuild": {
        const s = await rebuildReviewSessionQueue(cfg);
        return NextResponse.json({ ok: true, session: s });
      }
      case "review-session-cursor": {
        const rawDelta = body.delta;
        let delta = 1;
        if (rawDelta !== undefined && rawDelta !== null) {
          const n = typeof rawDelta === "number" ? rawDelta : parseInt(String(rawDelta), 10);
          if (!Number.isFinite(n) || Number.isNaN(n)) {
            return NextResponse.json({ error: "delta must be a finite number" }, { status: 400 });
          }
          delta = n;
        }
        const s = await advanceReviewSessionCursor(paths, delta);
        return NextResponse.json({ ok: true, session: s });
      }
      case "review-session-summary": {
        const rel = await writeReviewSessionSummaryMd(
          cfg,
          (body.reviewedIds as string[]) ?? [],
          body.notes as string | undefined
        );
        return NextResponse.json({ ok: true, path: rel });
      }
      case "steward-digest": {
        if (body.all) {
          const outs = await generateAllStewardDigests(cfg);
          return NextResponse.json({ ok: true, paths: outs });
        }
        const domain = String(body.domain ?? "work");
        const out = await generateStewardDigestForDomain(cfg, domain);
        return NextResponse.json({ ok: true, path: out });
      }
      case "quarterly-review": {
        const out = await generateQuarterlyOperationalReview(cfg);
        return NextResponse.json({ ok: true, path: out });
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

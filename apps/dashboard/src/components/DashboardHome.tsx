"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type RecentFile = { path: string; mtimeMs: number };

type Operational = {
  pendingWikiCount: number;
  pendingPaths: string[];
  reviewPendingCount: number;
  reviewStateVersion: string;
  staleIngest: boolean;
  staleLint: boolean;
  ingestAgeDays: number | null;
  lintAgeDays: number | null;
  reviewAgeDays: number | null;
  trustLevel: "clean" | "attention";
  lastIngestSummary?: string;
  lastLintSummary?: string;
  lastReviewSummary?: string;
  nextActions: string[];
  recentWiki: RecentFile[];
  recentOutputs: RecentFile[];
  suggestedCommitMessage: string;
};

type LastDoctorCache = {
  generatedAt: string;
  verdict: "ready" | "warnings" | "blocked";
  readinessLabel: string;
  summary: string;
  vaultName: string;
  vaultNameSource: string;
  failCount: number;
  warnCount: number;
  passCount: number;
  nextActions: string[];
};

type DoctorLastPayload = {
  cache: LastDoctorCache | null;
  meta: {
    neverRun: boolean;
    staleByAge: boolean;
    hints: string[];
    pendingWikiCountNow: number;
    error?: string;
  };
};

type ReviewDebtUi = {
  level?: string;
  score0to100?: number;
  trendHint?: string;
  contributors?: { label: string; count: number }[];
};

type ExecTrustCard = {
  overallPosture?: string;
  summaryLine?: string;
  generatedAt?: string;
  actionTelemetry?: {
    windowDays: number;
    suggestedCount: number;
    addressedInWindow: number;
  };
};

type CanonGuardStatus = {
  updatedAt: string;
  maxVerdict: "ok" | "warn" | "high_attention";
  summaryLine: string;
  findingCount: number;
  highAttentionPaths: string[];
  paths: string[];
  ignoredNoiseCount?: number;
  respectIgnore?: boolean;
};

type TrustHooksStatus = {
  preCommit: boolean;
  prePush: boolean;
  ignoreRuleCount: number;
  commitWarnOnly: boolean;
  prePushWarnOnly: boolean;
  prePushEnabled: boolean;
};

type Status = {
  root?: string;
  brainName?: string;
  vaultName?: string;
  vaultNameSource?: string;
  workspaceRoot?: string | null;
  gitRoot?: string;
  canonGuard?: CanonGuardStatus | null;
  trustHooks?: TrustHooksStatus;
  state?: {
    lastIngestAt?: string;
    lastCompileAt?: string;
    lastLintAt?: string;
    lastReviewAt?: string;
    pendingWikiChanges?: string[];
  };
  runs?: { kind: string; summary: string; ok: boolean; startedAt?: string }[];
  searchDocs?: number;
  graphMeta?: { nodeCount?: number; orphans?: number };
  logTail?: string;
  operational?: Operational;
  doctorLast?: DoctorLastPayload | null;
  reviewDebt?: ReviewDebtUi | null;
  execTrust?: ExecTrustCard | null;
  error?: string;
};

export function DashboardHome() {
  const [s, setS] = useState<Status | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [stRes, lastRes, debtRes, execRes] = await Promise.all([
        fetch("/api/status"),
        fetch("/api/doctor-last"),
        fetch("/api/review-debt"),
        fetch("/api/executive-trust"),
      ]);
      let doctorLast: DoctorLastPayload | null = null;
      if (lastRes.ok) {
        try {
          doctorLast = (await lastRes.json()) as DoctorLastPayload;
        } catch {
          doctorLast = null;
        }
      }
      let reviewDebt: ReviewDebtUi | null = null;
      if (debtRes.ok) {
        try {
          const dj = (await debtRes.json()) as ReviewDebtUi;
          if (dj.level) reviewDebt = dj;
        } catch {
          reviewDebt = null;
        }
      }
      let execTrust: ExecTrustCard | null = null;
      if (execRes.ok) {
        try {
          const ej = (await execRes.json()) as ExecTrustCard & { error?: string };
          if (ej.summaryLine && ej.generatedAt && !ej.error) execTrust = ej;
        } catch {
          execTrust = null;
        }
      }
      let st: Status;
      try {
        st = (await stRes.json()) as Status;
      } catch (e) {
        setS({
          error: e instanceof Error ? e.message : "Failed to load status.",
          doctorLast,
          reviewDebt,
          execTrust,
        });
        return;
      }
      if (!stRes.ok) {
        setS({
          error: typeof st.error === "string" ? st.error : "Could not load status.",
          doctorLast,
          reviewDebt,
          execTrust,
        });
        return;
      }
      setS({ ...st, doctorLast, reviewDebt, execTrust });
    } catch (e) {
      setS({
        error: e instanceof Error ? e.message : "Failed to load status.",
        doctorLast: null,
        reviewDebt: null,
        execTrust: null,
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function action(name: string, extra?: Record<string, unknown>) {
    setMsg("");
    const r = await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: name, ...extra }),
    });
    const j = await r.json();
    setMsg(JSON.stringify(j, null, 2));
    void load();
  }

  if (s?.error && !s.doctorLast) {
    return (
      <div className="max-w-xl rounded-lg border border-red-500/40 bg-red-950/30 p-4 text-sm">
        {s.error}
      </div>
    );
  }

  if (!s) {
    return <div className="text-[var(--muted)]">Loading brain status…</div>;
  }

  const op = s.operational;
  const pending = op?.pendingWikiCount ?? s.state?.pendingWikiChanges?.length ?? 0;
  const trust = op?.trustLevel ?? (pending > 0 ? "attention" : "clean");

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      {s.error ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/25 p-3 text-sm text-amber-100">
          Status API: {s.error}
          {s.doctorLast ? (
            <span className="block pt-1 text-xs text-[var(--muted)]">
              Cached doctor below may still help — fix env (e.g. SECOND_BRAIN_ROOT) and refresh.
            </span>
          ) : null}
        </div>
      ) : null}
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Command center</h1>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          Weekly rhythm: <strong className="text-[var(--foreground)]">ingest → diff → approve</strong>{" "}
          → review → lint. Wiki changes stay <strong className="text-[var(--foreground)]">untrusted</strong>{" "}
          until you review the git diff and commit.
        </p>
        <p className="font-mono text-xs text-[var(--accent)]">
          {s.brainName ? `${s.brainName} · ` : ""}
          {s.root}
        </p>
        {s.vaultName ? (
          <p className="text-xs text-[var(--muted)]">
            Obsidian vault name:{" "}
            <span className="font-mono text-[var(--accent)]">{s.vaultName}</span>
            {s.vaultNameSource ? (
              <span className="text-[var(--muted)]"> ({s.vaultNameSource})</span>
            ) : null}
            {s.vaultNameSource === "default" || s.vaultNameSource === "basename" ? (
              <span className="ml-1 text-amber-400/90">
                — set <code className="text-[var(--accent)]">SECOND_BRAIN_VAULT_NAME</code> to match
                Obsidian if links open the wrong vault.
              </span>
            ) : null}
          </p>
        ) : null}
        {s.workspaceRoot ? (
          <p className="text-xs text-[var(--muted)]">
            Workspace: <span className="font-mono">{s.workspaceRoot}</span>
          </p>
        ) : null}
      </header>

      <section
        className={`rounded-xl border p-4 ${
          trust === "attention"
            ? "border-amber-500/50 bg-amber-950/25"
            : "border-emerald-800/40 bg-emerald-950/15"
        }`}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Trust & review
        </h2>
        <p className="mt-2 text-sm">
          {trust === "attention" ? (
            <>
              <span className="font-medium text-amber-200">Attention:</span>{" "}
              {pending} wiki path(s) have uncommitted changes. Open{" "}
              <Link href="/diff" className="text-sky-400 underline">
                Diff
              </Link>{" "}
              to approve or reject, then run{" "}
              <code className="rounded bg-black/30 px-1">brain approve</code> from the repo CLI.
            </>
          ) : (
            <>
              <span className="font-medium text-emerald-300">Clean working tree</span> for scoped wiki
              paths — or changes already match HEAD. Keep using Diff after each ingest.
            </>
          )}
        </p>
        {op?.suggestedCommitMessage ? (
          <p className="mt-2 font-mono text-xs text-[var(--muted)]">
            Suggested commit message:{" "}
            <span className="text-[var(--accent)]">{op.suggestedCommitMessage}</span>
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sky-400">
          <Link href="/operations">Operations &amp; intelligence</Link>
          <Link href="/executive">Executive mode</Link>
          <Link href="/executive-trust">Executive trust</Link>
          <Link href="/canon-fragility">Canon fragility</Link>
          <Link href="/review-queue">Review priority</Link>
          <Link href="/trust">Trust &amp; curation hub</Link>
          <Link href="/promotion-inbox">Promotion inbox</Link>
          <Link href="/coverage">Coverage &amp; scorecards</Link>
          <Link href="/decisions">Decision ledger</Link>
          <Link href="/compare">Compare wiki pages</Link>
        </div>
      </section>

      {s.trustHooks ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)]/40 px-3 py-2 text-xs text-[var(--muted)]">
          <span className="font-medium text-[var(--foreground)]">Canon guard tooling:</span> git pre-commit{" "}
          {s.trustHooks.preCommit ? "on" : "off"}, pre-push {s.trustHooks.prePush ? "on" : "off"}. Ignore list
          entries: {s.trustHooks.ignoreRuleCount}. Pre-push scans {s.trustHooks.prePushEnabled ? "enabled" : "disabled"}{" "}
          in settings. Hooks: commit {s.trustHooks.commitWarnOnly ? "warn-only" : "strict — blocks HIGH ATTENTION"}
          {" · "}
          push {s.trustHooks.prePushWarnOnly ? "warn-only" : "strict"}.
        </section>
      ) : null}

      {s.canonGuard &&
      (s.canonGuard.maxVerdict !== "ok" || s.canonGuard.highAttentionPaths.length > 0) ? (
        <section
          className={`rounded-xl border p-4 ${
            s.canonGuard.maxVerdict === "high_attention"
              ? "border-rose-500/45 bg-rose-950/20"
              : "border-amber-500/40 bg-amber-950/20"
          }`}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Canon guard (last CLI scan)
          </h2>
          <p className="mt-2 text-sm text-[var(--foreground)]">{s.canonGuard.summaryLine}</p>
          <p className="mt-1 font-mono text-xs text-[var(--muted)]">
            Updated {s.canonGuard.updatedAt.slice(0, 19).replace("T", " ")} · verdict{" "}
            <span className="text-[var(--accent)]">{s.canonGuard.maxVerdict}</span>
            {s.canonGuard.highAttentionPaths[0] ? (
              <>
                {" "}
                ·{" "}
                <span className="text-amber-200/90">
                  {s.canonGuard.highAttentionPaths.slice(0, 4).join(", ")}
                  {s.canonGuard.highAttentionPaths.length > 4 ? "…" : ""}
                </span>
              </>
            ) : null}
          </p>
          {(s.canonGuard.ignoredNoiseCount ?? 0) > 0 ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              Last run skipped {s.canonGuard.ignoredNoiseCount} open-noise path(s) (ignore lists; high-trust still
              scanned).
              {s.canonGuard.respectIgnore === false ? " Scan used --no-respect-ignore." : ""}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-[var(--muted)]">
            Run <code className="text-[var(--accent)]">brain canon-guard</code> after editing canon or locked
            pages in Obsidian or an editor. Cache lives in{" "}
            <code className="text-[var(--accent)]">.brain/last-canon-guard.json</code>.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-sky-400">
            <Link href="/canon-council">Canon council</Link>
            <Link href="/canon-admission">Canon admission</Link>
            <Link href="/review-session">Review session</Link>
            <Link href="/trust">Trust hub</Link>
          </div>
        </section>
      ) : null}

      {!s.canonGuard && op && pending > 0 ? (
        <section className="rounded-xl border border-zinc-600/40 bg-zinc-950/30 p-3 text-xs text-[var(--muted)]">
          <strong className="text-[var(--foreground)]">Tip:</strong> wiki changes pending — run{" "}
          <code className="text-[var(--accent)]">brain canon-guard</code> before commit if any path is canonical
          or locked (updates <code className="text-[var(--accent)]">.brain/last-canon-guard.json</code>).
        </section>
      ) : null}

      {s.reviewDebt?.level ? (
        <section
          className={`rounded-xl border p-4 ${
            s.reviewDebt.level === "critical" || s.reviewDebt.level === "high"
              ? "border-amber-600/45 bg-amber-950/20"
              : "border-[var(--border)] bg-[var(--card)]/50"
          }`}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Review debt</h2>
          <p className="mt-2 text-sm capitalize text-[var(--foreground)]">
            {s.reviewDebt.level}{" "}
            <span className="text-[var(--muted)]">
              ·{" "}
              {typeof s.reviewDebt.score0to100 === "number"
                ? `~${s.reviewDebt.score0to100}/100`
                : "—"}{" "}
              · {s.reviewDebt.trendHint ?? "—"}
            </span>
          </p>
          {s.reviewDebt.contributors?.[0] ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              Top: {s.reviewDebt.contributors[0].label} ({s.reviewDebt.contributors[0].count})
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-sky-400">
            <Link href="/executive">Executive · plans</Link>
            <Link href="/canon-council">Canon council</Link>
            <Link href="/review-session">Review session</Link>
          </div>
        </section>
      ) : null}

      {s.execTrust?.summaryLine ? (
        <section className="rounded-xl border border-sky-800/35 bg-sky-950/15 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Executive trust (weekly scan)
          </h2>
          <p className="mt-2 text-sm capitalize text-[var(--foreground)]">
            {s.execTrust.overallPosture?.replace(/_/g, " ") ?? "—"}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{s.execTrust.summaryLine}</p>
          {s.execTrust.actionTelemetry ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Actions this {s.execTrust.actionTelemetry.windowDays}d:{" "}
              <span className="text-[var(--foreground)]">
                {s.execTrust.actionTelemetry.addressedInWindow}/{s.execTrust.actionTelemetry.suggestedCount}
              </span>{" "}
              suggested items marked (log-backed).
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-sky-400">
            <Link href="/executive-trust">Open control panel</Link>
            <Link href="/canon-fragility">Fragile trusted pages</Link>
            <Link href="/review-session">Start review session</Link>
          </div>
        </section>
      ) : null}

      {s.doctorLast ? (
        <section
          className={`rounded-xl border p-4 ${
            s.doctorLast.meta.neverRun
              ? "border-zinc-600/50 bg-zinc-950/40"
              : s.doctorLast.cache?.verdict === "blocked"
                ? "border-red-500/45 bg-red-950/25"
                : s.doctorLast.cache?.verdict === "warnings"
                  ? "border-amber-500/45 bg-amber-950/20"
                  : "border-emerald-800/35 bg-emerald-950/15"
          }`}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Readiness (doctor, cached)
          </h2>
          {s.doctorLast.meta.neverRun ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              <strong className="text-[var(--foreground)]">No doctor run yet.</strong> Run{" "}
              <code className="text-[var(--accent)]">brain doctor</code> once after setup (default writes{" "}
              <code className="text-[var(--accent)]">.brain/last-doctor.json</code>
              ). Home reads that file so we do not re-run checks on every refresh.
            </p>
          ) : s.doctorLast.cache ? (
            <>
              <p className="mt-2 text-sm">{s.doctorLast.cache.readinessLabel}</p>
              <p className="mt-1 font-mono text-xs text-[var(--muted)]">
                Last run: {s.doctorLast.cache.generatedAt.slice(0, 19).replace("T", " ")} · vault{" "}
                <span className="text-[var(--accent)]">{s.doctorLast.cache.vaultName}</span> (
                {s.doctorLast.cache.vaultNameSource})
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Fails: {s.doctorLast.cache.failCount} · Warns: {s.doctorLast.cache.warnCount}
              </p>
              {s.doctorLast.cache.nextActions[0] ? (
                <p className="mt-2 text-xs text-[var(--foreground)]">
                  <span className="text-[var(--muted)]">Top next:</span> {s.doctorLast.cache.nextActions[0]}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-sm text-[var(--muted)]">Could not read cached doctor result.</p>
          )}
          {(s.doctorLast.meta.staleByAge || s.doctorLast.meta.hints.length > 0) && !s.doctorLast.meta.neverRun ? (
            <ul className="mt-3 list-inside list-disc space-y-1 border-t border-[var(--border)]/60 pt-3 text-xs text-amber-200/95">
              {s.doctorLast.meta.staleByAge ? (
                <li>Snapshot may be stale — run `brain doctor` again for a current check.</li>
              ) : null}
              {s.doctorLast.meta.hints.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          ) : null}
          {s.doctorLast.meta.error ? (
            <p className="mt-2 text-xs text-amber-400/90">{s.doctorLast.meta.error}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/doctor"
              className="rounded-md bg-violet-600/90 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500"
            >
              Doctor detail
            </Link>
            <span className="self-center text-xs text-[var(--muted)]">
              Refresh cache: <code className="text-[var(--accent)]">brain doctor</code> (omit{" "}
              <code className="text-[var(--accent)]">--no-save</code>)
            </span>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)]/50 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Weekly workflow
        </h2>
        <ol className="mt-3 list-inside list-decimal space-y-2 text-sm text-[var(--muted)]">
          <li>Add or update files under raw/ (e.g. raw/inbox/).</li>
          <li>
            <strong>Ingest</strong> — synthesizes into wiki/ and refreshes indexes.
          </li>
          <li>
            <strong>Diff</strong> — read every changed path; approve/reject in the UI.
          </li>
          <li>
            <strong>Approve</strong> —{" "}
            <code className="rounded bg-black/30 px-1">brain approve</code> commits approved paths.
          </li>
          <li>
            <strong>Weekly review</strong> — executive markdown in outputs/reviews/.
          </li>
          <li>
            <strong>Lint</strong> — health report in outputs/health-checks/.
          </li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionBtn onClick={() => action("ingest")}>Run ingest</ActionBtn>
          <ActionBtn onClick={() => action("weekly-review")}>Run weekly review</ActionBtn>
          <ActionBtn onClick={() => action("lint")}>Run lint</ActionBtn>
          <Link
            href="/diff"
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)]"
          >
            Open diff ({pending})
          </Link>
        </div>
        {op?.nextActions?.length ? (
          <ul className="mt-4 space-y-1 border-t border-[var(--border)]/60 pt-4 text-sm text-[var(--muted)]">
            <li className="text-xs font-semibold uppercase text-[var(--foreground)]">Suggested next</li>
            {op.nextActions.map((t, i) => (
              <li key={i}>• {t}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Last ingest"
          value={s.state?.lastIngestAt?.slice(0, 19) ?? "—"}
          stale={!!op?.staleIngest}
        />
        <Metric
          label="Last lint"
          value={s.state?.lastLintAt?.slice(0, 19) ?? "—"}
          stale={!!op?.staleLint}
        />
        <Metric
          label="Last weekly review"
          value={s.state?.lastReviewAt?.slice(0, 19) ?? "—"}
          stale={(op?.reviewAgeDays ?? 0) > 7}
        />
        <Metric label="Search index docs" value={String(s.searchDocs ?? 0)} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/80 p-4">
          <div className="text-xs uppercase text-[var(--muted)]">Graph</div>
          <div className="mt-2 text-lg font-medium">
            {s.graphMeta?.nodeCount ?? 0} nodes · {s.graphMeta?.orphans ?? 0} orphans
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/80 p-4">
          <div className="text-xs uppercase text-[var(--muted)]">Last run summaries</div>
          <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
            <li>
              <span className="text-[var(--foreground)]">Ingest:</span>{" "}
              {op?.lastIngestSummary ?? "—"}
            </li>
            <li>
              <span className="text-[var(--foreground)]">Lint:</span>{" "}
              {op?.lastLintSummary ?? "—"}
            </li>
            <li>
              <span className="text-[var(--foreground)]">Review:</span>{" "}
              {op?.lastReviewSummary ?? "—"}
            </li>
          </ul>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Quick actions
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionBtn onClick={() => action("ingest")}>Ingest</ActionBtn>
            <ActionBtn onClick={() => action("ingest", { force: true })}>Ingest (force)</ActionBtn>
            <ActionBtn onClick={() => action("compile")}>Compile</ActionBtn>
            <ActionBtn onClick={() => action("lint")}>Lint</ActionBtn>
            <Link
              href="/search"
              className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)]"
            >
              Search
            </Link>
            <Link
              href="/wiki"
              className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)]"
            >
              Wiki
            </Link>
            <Link
              href="/operations"
              className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)]"
            >
              Operations
            </Link>
            <Link
              href="/doctor"
              className="rounded-md border border-violet-500/50 px-3 py-2 text-sm text-violet-200 hover:border-violet-400"
            >
              Run doctor
            </Link>
          </div>
          {msg ? (
            <pre className="mt-4 max-h-48 overflow-auto rounded-md bg-black/40 p-3 text-xs text-emerald-200">
              {msg}
            </pre>
          ) : null}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Recent runs
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            {(s.runs ?? []).map((r, i) => (
              <li
                key={i}
                className="flex justify-between gap-4 border-b border-[var(--border)]/60 pb-2"
              >
                <span className="text-[var(--muted)]">{r.kind}</span>
                <span className="flex-1 truncate text-right">{r.summary}</span>
                <span className={r.ok ? "text-emerald-400" : "text-amber-400"}>
                  {r.ok ? "ok" : "warn"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Recent wiki edits (mtime)
          </h2>
          <ul className="mt-3 space-y-1 font-mono text-xs text-[var(--accent)]">
            {(op?.recentWiki ?? []).map((f) => (
              <li key={f.path}>
                <Link href={`/wiki?path=${encodeURIComponent(f.path)}`} className="hover:underline">
                  {f.path}
                </Link>
              </li>
            ))}
            {!op?.recentWiki?.length ? <li className="text-[var(--muted)]">—</li> : null}
          </ul>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Recent outputs
          </h2>
          <ul className="mt-3 space-y-1 font-mono text-xs text-[var(--accent)]">
            {(op?.recentOutputs ?? []).map((f) => (
              <li key={f.path}>
                <span className="text-[var(--muted)]">{f.path}</span>
              </li>
            ))}
            {!op?.recentOutputs?.length ? <li className="text-[var(--muted)]">—</li> : null}
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Log tail
        </h2>
        <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap font-mono text-xs text-[var(--muted)]">
          {s.logTail ?? "—"}
        </pre>
      </section>

      {s.workspaceRoot ? (
        <p className="text-center text-xs text-[var(--muted)]">
          <Link href="/workspace" className="text-sky-400 hover:underline">
            Workspace overview
          </Link>
          {" · "}
          <Link href="/promotions" className="text-sky-400 hover:underline">
            Promotions
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  stale,
}: {
  label: string;
  value: string;
  stale?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        stale ? "border-amber-600/40 bg-amber-950/20" : "border-[var(--border)] bg-[var(--card)]/80"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-lg font-medium">{value}</div>
      {stale ? (
        <div className="mt-1 text-xs text-amber-400/90">&gt; 7d — run a fresh pass</div>
      ) : null}
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md bg-sky-600/90 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
    >
      {children}
    </button>
  );
}

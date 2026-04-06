"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ExecutiveTrust = {
  version?: number;
  generatedAt: string;
  overallPosture: string;
  postureExplanation: string;
  summaryLine: string;
  keyStats: {
    highTrustPagesOnBoard?: number;
    fragilityElevatedOrHigher?: number;
    fragilityHighOrCritical?: number;
    reviewDebtLevel?: string;
    reviewDebtScore0to100?: number;
    openCrossSignalHotspots?: number;
    pendingCanonPromotions?: number;
    urgentReviewQueue?: number;
  };
  topActions: {
    label: string;
    href: string;
    kind: string;
    cliHint?: string;
    actionKey?: string;
    targetPath?: string;
    lastMarkedDoneAt?: string;
  }[];
  actionTelemetry?: {
    windowDays: number;
    suggestedCount: number;
    addressedInWindow: number;
  };
  topFragilePages: { path: string; title: string; level: string; drivers: string[] }[];
  trustWins: { path: string; title: string; reason: string }[];
  canonPostureLine: string;
  debtPostureLine: string;
  domains: {
    domain: string;
    topIssue: string;
    postureHint: string;
    suggestedFocus: string;
  }[];
  highPriorityReview: { path: string; bucket: string; why: string }[];
  majorDrivers: string[];
  hotspotsLine?: string;
  error?: string;
};

function postureStyle(p: string) {
  if (p === "strong") return "border-emerald-800/50 bg-emerald-950/20 text-emerald-100";
  if (p === "stable_watchlist") return "border-sky-800/40 bg-sky-950/15 text-sky-100";
  if (p === "mixed") return "border-amber-600/45 bg-amber-950/20 text-amber-100";
  if (p === "fragile" || p === "high_attention")
    return "border-rose-600/45 bg-rose-950/25 text-rose-100";
  return "border-[var(--border)] bg-[var(--card)]/40";
}

export default function ExecutiveTrustPage() {
  const [data, setData] = useState<ExecutiveTrust | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setMsg("");
    const r = await fetch("/api/executive-trust");
    const j = (await r.json()) as ExecutiveTrust & { error?: string };
    if (!r.ok || j.error || !j.generatedAt) {
      setData(null);
      setMsg(j.error ?? "Failed to load");
      return;
    }
    setData(j);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markActionDone(actionKey: string, targetPath?: string) {
    if (!actionKey || busy) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/executive-trust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markActionDone: true, actionKey, targetPath }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; summary?: ExecutiveTrust };
      if (!r.ok || !j.ok) {
        setMsg(j.error ?? "Could not log completion");
        return;
      }
      if (j.summary) setData(j.summary);
      else await load();
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(writeMd: boolean) {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/executive-trust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ writeMarkdown: writeMd }),
      });
      const j = (await r.json()) as { ok?: boolean; errors?: string[]; markdownRel?: string; error?: string };
      if (!r.ok) {
        setMsg(j.error ?? "Regenerate failed");
        return;
      }
      if (j.errors?.length) setMsg(j.errors.join(" · "));
      if (j.markdownRel) setMsg((m) => (m ? `${m} · ` : "") + `Wrote ${j.markdownRel}`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!data && !msg) return <p className="text-[var(--muted)]">Loading…</p>;

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold">Executive trust summary</h1>
        <p className="text-sm text-amber-200/90">{msg || "No data yet."}</p>
        <p className="text-xs text-[var(--muted)]">
          Run <code className="text-[var(--accent)]">brain lint</code>,{" "}
          <code className="text-[var(--accent)]">brain operational refresh</code>, or{" "}
          <code className="text-[var(--accent)]">brain executive-trust</code> from the repo.
        </p>
        <button
          type="button"
          disabled={busy}
          className="rounded-md border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
          onClick={() => void regenerate(false)}
        >
          Regenerate (server)
        </button>
      </div>
    );
  }

  const ks = data.keyStats ?? {};

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Executive trust</h1>
          <p className="mt-1 font-mono text-xs text-[var(--muted)]">
            {data.generatedAt.slice(0, 19).replace("T", " ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
            onClick={() => void regenerate(false)}
          >
            Regenerate JSON
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-md border border-emerald-900/50 px-3 py-2 text-xs text-emerald-200 disabled:opacity-50"
            onClick={() => void regenerate(true)}
          >
            Regenerate + MD report
          </button>
          <Link href="/review-session" className="rounded-md border border-violet-900/50 px-3 py-2 text-xs text-violet-200">
            Review session
          </Link>
        </div>
      </header>

      {msg ? <p className="text-xs text-amber-200/90">{msg}</p> : null}

      {data.actionTelemetry ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--card)]/20 px-3 py-2 text-xs text-[var(--muted)]">
          <span className="text-[var(--foreground)]">Action cadence:</span>{" "}
          {data.actionTelemetry.addressedInWindow}/{data.actionTelemetry.suggestedCount} suggested links marked in the
          last {data.actionTelemetry.windowDays} days (see governance-action-log). Review session completions also count
          toward &quot;Review session&quot;.
        </p>
      ) : null}

      <section className={`rounded-xl border p-4 ${postureStyle(data.overallPosture)}`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide opacity-90">
          Posture · {data.overallPosture.replace(/_/g, " ")}
        </h2>
        <p className="mt-3 text-base leading-relaxed">{data.summaryLine}</p>
        <p className="mt-2 text-sm opacity-90">{data.postureExplanation}</p>
        {data.hotspotsLine ? (
          <p className="mt-2 text-xs opacity-80">Hotspots: {data.hotspotsLine}</p>
        ) : null}
      </section>

      <section className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)]/30 p-4 text-sm md:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase text-[var(--muted)]">Canon</h3>
          <p className="mt-1 text-[var(--foreground)]">{data.canonPostureLine}</p>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase text-[var(--muted)]">Review debt</h3>
          <p className="mt-1 text-[var(--foreground)]">{data.debtPostureLine}</p>
        </div>
        <div className="md:col-span-2 mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
          <span>High-trust board: {ks.highTrustPagesOnBoard ?? "—"}</span>
          <span>Elevated+ fragility: {ks.fragilityElevatedOrHigher ?? "—"}</span>
          <span>High/critical fragility: {ks.fragilityHighOrCritical ?? "—"}</span>
          <span>Cross-signal hotspots: {ks.openCrossSignalHotspots ?? "—"}</span>
          <span>Pending promotions: {ks.pendingCanonPromotions ?? "—"}</span>
          <span>Urgent queue: {ks.urgentReviewQueue ?? "—"}</span>
        </div>
      </section>

      {data.majorDrivers?.length ? (
        <section>
          <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">Major drivers</h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-[var(--muted)]">
            {data.majorDrivers.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">Top fragile (trusted)</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {data.topFragilePages.length ? (
            data.topFragilePages.map((p) => (
              <li key={p.path} className="rounded-lg border border-[var(--border)] bg-black/20 px-3 py-2">
                <Link href={`/wiki?path=${encodeURIComponent(p.path)}`} className="font-medium text-sky-400">
                  {p.title}
                </Link>
                <span className="ml-2 text-xs uppercase text-amber-200/80">{p.level}</span>
                <p className="mt-1 text-xs text-[var(--muted)]">{p.drivers.join(" · ")}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <Link href={`/wiki?path=${encodeURIComponent(p.path)}`} className="text-sky-500">
                    Open page
                  </Link>
                  <a href={`/api/wiki-trace?path=${encodeURIComponent(p.path)}`} className="text-sky-500">
                    Trace JSON
                  </a>
                  <Link href="/drift" className="text-sky-500">
                    Drift hub
                  </Link>
                  <Link href="/conflicts" className="text-sky-500">
                    Conflicts
                  </Link>
                  <Link href="/canon-fragility" className="text-sky-500">
                    Fragility index
                  </Link>
                </div>
              </li>
            ))
          ) : (
            <li className="text-[var(--muted)]">None surfaced — good sign for this pass.</li>
          )}
        </ul>
      </section>

      {data.trustWins?.length ? (
        <section className="rounded-xl border border-emerald-900/35 bg-emerald-950/15 p-4">
          <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">Trust wins</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {data.trustWins.map((w) => (
              <li key={w.path}>
                <Link href={`/wiki?path=${encodeURIComponent(w.path)}`} className="text-emerald-300">
                  {w.title}
                </Link>
                <span className="text-xs text-[var(--muted)]"> — {w.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.highPriorityReview?.length ? (
        <section>
          <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">Review queue (urgent / soon)</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {data.highPriorityReview.map((r) => (
              <li key={r.path} className="flex flex-wrap justify-between gap-2">
                <Link href={`/wiki?path=${encodeURIComponent(r.path)}`} className="text-sky-400">
                  {r.path}
                </Link>
                <span className="text-xs text-[var(--muted)]">
                  {r.bucket} · {r.why}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/review-queue" className="mt-2 inline-block text-xs text-sky-500">
            Full queue →
          </Link>
        </section>
      ) : null}

      {data.domains?.length ? (
        <section>
          <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">Domains</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs text-[var(--muted)]">
                  <th className="py-2 pr-3">Domain</th>
                  <th className="py-2 pr-3">Posture</th>
                  <th className="py-2 pr-3">Top issue</th>
                  <th className="py-2">Focus</th>
                </tr>
              </thead>
              <tbody>
                {data.domains.map((d) => (
                  <tr key={d.domain} className="border-b border-[var(--border)]/60">
                    <td className="py-2 pr-3 font-medium">{d.domain}</td>
                    <td className="py-2 pr-3 capitalize text-[var(--muted)]">{d.postureHint}</td>
                    <td className="py-2 pr-3 text-[var(--muted)]">{d.topIssue}</td>
                    <td className="py-2 text-xs text-[var(--foreground)]">{d.suggestedFocus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">Next actions</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Open a link, then optionally <strong className="text-[var(--foreground)]">Mark done</strong> to append a row to{" "}
          <code className="text-[var(--accent)]">.brain/governance-action-log.json</code> (honor system — for weekly
          rhythm, not proof).
        </p>
        <ul className="mt-3 space-y-2">
          {data.topActions.map((a, i) => (
            <li
              key={a.actionKey ? `${a.actionKey}-${a.targetPath ?? ""}` : i}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-black/15 px-3 py-2 text-xs"
            >
              {a.kind === "nav" ? (
                <Link href={a.href} className="text-sky-400 hover:underline">
                  {a.label}
                </Link>
              ) : (
                <span className="text-[var(--muted)]">
                  {a.label}
                  {a.cliHint ? ` (${a.cliHint})` : ""}
                </span>
              )}
              {a.lastMarkedDoneAt ? (
                <span className="text-emerald-400/90">Done {a.lastMarkedDoneAt.slice(0, 10)}</span>
              ) : (
                <span className="text-[var(--muted)]">Not marked this window</span>
              )}
              {a.actionKey ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void markActionDone(a.actionKey!, a.targetPath)}
                  className="rounded border border-zinc-600 px-2 py-1 text-[var(--muted)] hover:border-emerald-700 hover:text-emerald-300 disabled:opacity-50"
                >
                  Mark done
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs leading-relaxed text-[var(--muted)]">
        Heuristic summary only — use for prioritization, not as proof of correctness. Regenerates with governance
        refresh; optional markdown via Regenerate + MD or <code className="text-[var(--accent)]">brain executive-trust --md</code>.
        CLI: <code className="text-[var(--accent)]">brain executive-trust --ack nav_drift</code> (optional{" "}
        <code className="text-[var(--accent)]">--path</code> for <code className="text-[var(--accent)]">review_fragile_top</code>
        ).
      </p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ReviewDebt = {
  level?: string;
  score0to100?: number;
  trendHint?: string;
  contributors?: { label: string; count: number }[];
};

type Snap = {
  headline: string;
  recentDecisions: { title: string; path: string; status: string }[];
  openConflicts: number;
  conflictSamples: { topic: string; id: string }[];
  driftAlerts: number;
  driftSamples: { pagePath: string; summary: string }[];
  driftWithDecisionImpact?: number;
  reviewTop: { path: string; bucket: string; priority0to100: number }[];
  openLoopsHigh: { title: string; path: string }[];
  crossSignalTop?: { path: string; dragonScore: number; headline: string }[];
  weakestDomain?: string;
  lastRunSummary?: string;
};

export default function ExecutivePage() {
  const [s, setS] = useState<Snap | null>(null);
  const [busy, setBusy] = useState(false);
  const [debt, setDebt] = useState<ReviewDebt | null>(null);
  const [planMsg, setPlanMsg] = useState("");
  const [isGeneratingPacket, setIsGeneratingPacket] = useState(false);

  const load = useCallback(async (refresh: boolean) => {
    setBusy(true);
    try {
      const r = await fetch(refresh ? "/api/executive?refresh=1" : "/api/executive");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "failed");
      setS(j);
    } catch {
      setS(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    void (async () => {
      try {
        const r = await fetch("/api/review-debt");
        if (!r.ok) {
          setDebt(null);
          return;
        }
        let j: ReviewDebt & { error?: string } = {};
        try {
          j = (await r.json()) as typeof j;
        } catch {
          setDebt(null);
          return;
        }
        if (j.level) setDebt(j);
        else setDebt(null);
      } catch {
        setDebt(null);
      }
    })();
  }, [load]);

  if (!s && busy) return <p className="text-[var(--muted)]">Loading…</p>;
  if (!s) return <p className="text-red-400">Could not load executive snapshot. Try Refresh operational intelligence on Operations first.</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Executive mode</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <Link
            href="/executive-trust"
            className="rounded-md border border-emerald-900/45 bg-emerald-950/20 px-2 py-1 text-emerald-200"
          >
            Executive trust summary →
          </Link>
          <Link href="/canon-fragility" className="rounded-md border border-amber-900/40 px-2 py-1 text-amber-200">
            Canon fragility →
          </Link>
        </div>
        <p className="mt-3 text-lg text-[var(--foreground)] leading-relaxed">{s.headline}</p>
        {s.lastRunSummary ? (
          <p className="mt-2 text-xs text-[var(--muted)]">Last run: {s.lastRunSummary}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void load(true)}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-xs hover:border-sky-500/50 disabled:opacity-50"
          >
            Rebuild snapshot (server)
          </button>
          <Link href="/operations" className="rounded-md border border-[var(--border)] px-3 py-2 text-xs">
            Full operational refresh
          </Link>
          <Link href="/canon-council" className="rounded-md border border-violet-800/40 px-3 py-2 text-xs text-violet-200">
            Canon council
          </Link>
          <button
            type="button"
            disabled={isGeneratingPacket}
            aria-busy={isGeneratingPacket}
            className="rounded-md border border-emerald-800/50 px-3 py-2 text-xs text-emerald-300 disabled:opacity-50"
            onClick={async () => {
              if (isGeneratingPacket) return;
              setIsGeneratingPacket(true);
              try {
                const r = await fetch("/api/review-packet", { method: "POST" });
                let j: { path?: string; error?: string } = {};
                try {
                  j = (await r.json()) as typeof j;
                } catch {
                  alert(r.ok ? "Invalid response from server." : `HTTP ${r.status}`);
                  return;
                }
                if (!r.ok) {
                  alert(j.error ?? `Failed (HTTP ${r.status})`);
                  return;
                }
                if (j.path) alert(`Wrote ${j.path}`);
                else alert("Success but no path returned.");
              } catch (e) {
                alert(e instanceof Error ? e.message : "Network error");
              } finally {
                setIsGeneratingPacket(false);
              }
            }}
          >
            {isGeneratingPacket ? "Generating…" : "Generate review packet"}
          </button>
        </div>
      </header>

      {debt ? (
        <section className="rounded-xl border border-zinc-700/50 bg-zinc-950/30 p-4">
          <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">Review debt meter</h2>
          <p className="mt-2 text-lg font-medium capitalize text-[var(--foreground)]">
            {debt.level}
            <span className="ml-2 text-sm font-normal text-[var(--muted)]">
              (~{debt.score0to100}/100 · {debt.trendHint ?? "trend ?"})
            </span>
          </p>
          {debt.contributors?.length ? (
            <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
              {debt.contributors.slice(0, 5).map((c, i) => (
                <li key={i}>
                  {c.label}: <strong className="text-[var(--foreground)]">{c.count}</strong>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/review-session" className="text-xs text-sky-400">
              Review session
            </Link>
            <Link href="/strategic-themes" className="text-xs text-sky-400">
              Strategic themes
            </Link>
            <Link href="/qoq-diff" className="text-xs text-sky-400">
              QoQ diff
            </Link>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)]/30 p-4">
        <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">Review workload balancing</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Pick a time box — we&apos;ll order high-signal items from the canon council, queue, and sunset hints.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["10min", "30min", "60min"] as const).map((lbl) => (
            <button
              key={lbl}
              type="button"
              className="rounded-md border border-[var(--border)] px-3 py-2 text-xs"
              onClick={async () => {
                setPlanMsg("");
                try {
                  const r = await fetch("/api/review-plan", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ label: lbl, write: true }),
                  });
                  let j: { path?: string; error?: string } = {};
                  try {
                    j = (await r.json()) as typeof j;
                  } catch (e) {
                    setPlanMsg(e instanceof Error ? e.message : "Invalid response from server.");
                    return;
                  }
                  if (!r.ok) {
                    setPlanMsg(typeof j.error === "string" ? j.error : `Request failed (HTTP ${r.status})`);
                    return;
                  }
                  const p = j.path ?? "<unknown>";
                  setPlanMsg(`Wrote ${p}`);
                } catch (e) {
                  setPlanMsg(e instanceof Error ? e.message : "Network error");
                }
              }}
            >
              Plan + save {lbl}
            </button>
          ))}
          <button
            type="button"
            className="rounded-md border border-emerald-900/50 px-3 py-2 text-xs text-emerald-200"
            onClick={async () => {
              try {
                const r = await fetch("/api/annual-review", { method: "POST" });
                let j: { path?: string; error?: string } = {};
                try {
                  j = (await r.json()) as typeof j;
                } catch (e) {
                  setPlanMsg(e instanceof Error ? e.message : "Invalid response from server.");
                  return;
                }
                if (!r.ok) {
                  setPlanMsg(typeof j.error === "string" ? j.error : `Request failed (HTTP ${r.status})`);
                  return;
                }
                const p = j.path ?? "file";
                setPlanMsg(`Annual: ${p}`);
              } catch (e) {
                setPlanMsg(e instanceof Error ? e.message : "Network error");
              }
            }}
          >
            Generate annual review
          </button>
        </div>
        {planMsg ? <p className="mt-2 text-xs text-emerald-300">{planMsg}</p> : null}
      </section>

      {(s.crossSignalTop?.length ?? 0) > 0 ? (
        <section className="rounded-xl border border-red-900/35 bg-red-950/20 p-4">
          <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">Cross-signal (dragons)</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {(s.crossSignalTop ?? []).map((d) => (
              <li key={d.path}>
                <Link href={`/wiki?path=${encodeURIComponent(d.path)}`} className="text-sky-400">
                  {d.path}
                </Link>
                <span className="text-xs text-[var(--muted)]">
                  {" "}
                  {d.dragonScore} — {d.headline}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/canonical-board" className="mt-2 inline-block text-xs text-sky-500">
            Canonical board →
          </Link>
        </section>
      ) : null}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)]/40 p-4">
        <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">Review first</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {s.reviewTop.map((r) => (
            <li key={r.path} className="flex justify-between gap-2">
              <Link href={`/wiki?path=${encodeURIComponent(r.path)}`} className="text-sky-400 hover:underline">
                {r.path}
              </Link>
              <span className="text-xs text-[var(--muted)]">
                {r.bucket} · {r.priority0to100}
              </span>
            </li>
          ))}
        </ul>
        <Link href="/review-queue" className="mt-3 inline-block text-xs text-sky-500">
          Full queue →
        </Link>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">
            Decisions · {s.recentDecisions.length}
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {s.recentDecisions.map((d) => (
              <li key={d.path}>
                <Link href={`/wiki?path=${encodeURIComponent(d.path)}`} className="text-sky-400">
                  {d.title}
                </Link>
                <span className="text-xs text-[var(--muted)]"> · {d.status}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">Signals</h2>
          <ul className="mt-2 space-y-2 text-sm text-[var(--muted)]">
            <li>
              Conflicts (open): <strong className="text-[var(--foreground)]">{s.openConflicts}</strong>
            </li>
            <li>
              Drift watches: <strong className="text-[var(--foreground)]">{s.driftAlerts}</strong>
              {typeof s.driftWithDecisionImpact === "number" && s.driftWithDecisionImpact > 0 ? (
                <span className="text-amber-200/90">
                  {" "}
                  ({s.driftWithDecisionImpact} with decision impact)
                </span>
              ) : null}
            </li>
            <li>
              Weakest domain (heatmap):{" "}
              <strong className="text-[var(--foreground)]">{s.weakestDomain ?? "—"}</strong>
            </li>
          </ul>
        </section>
      </div>

      {s.conflictSamples.length ? (
        <section>
          <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">Conflict samples</h2>
          <ul className="mt-2 text-sm">
            {s.conflictSamples.map((c) => (
              <li key={c.id} className="text-[var(--muted)]">
                {c.topic}
              </li>
            ))}
          </ul>
          <Link href="/conflicts" className="mt-2 inline-block text-xs text-sky-400">
            Open resolver →
          </Link>
        </section>
      ) : null}

      {s.openLoopsHigh.length ? (
        <section>
          <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">High-impact open loops</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {s.openLoopsHigh.map((l) => (
              <li key={l.path + l.title}>
                {l.title}{" "}
                <span className="font-mono text-xs text-[var(--accent)]">{l.path}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

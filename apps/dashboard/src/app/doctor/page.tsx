"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type DoctorCheck = { id: string; status: string; message: string };
type DoctorSection = { title: string; checks: DoctorCheck[] };
type DoctorReport = {
  generatedAt: string;
  vaultRoot: string;
  summary: "ready" | "warnings" | "blocked";
  summaryLine: string;
  sections: DoctorSection[];
  nextActions: string[];
};

type LastDoctorCache = {
  generatedAt: string;
  verdict: DoctorReport["summary"];
  readinessLabel: string;
  vaultName: string;
  vaultNameSource: string;
  sectionStatuses: { id: string; worst: string; pass: number; warn: number; fail: number }[];
  nextActions: string[];
  reportPath?: string;
  failCount: number;
  warnCount: number;
  passCount: number;
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

type ViewMode = "cached" | "fresh";

export default function DoctorPage() {
  const [last, setLast] = useState<DoctorLastPayload | null>(null);
  const [fresh, setFresh] = useState<DoctorReport | null>(null);
  const [mode, setMode] = useState<ViewMode>("cached");
  const [loading, setLoading] = useState<"idle" | "cache" | "fresh">("idle");
  const [err, setErr] = useState("");

  const loadCache = useCallback(async () => {
    setLoading("cache");
    setErr("");
    try {
      const r = await fetch("/api/doctor-last");
      const j = (await r.json()) as DoctorLastPayload;
      setLast(j);
    } catch (e) {
      setErr(String(e));
      setLast(null);
    } finally {
      setLoading("idle");
    }
  }, []);

  const loadFresh = useCallback(async () => {
    setLoading("fresh");
    setErr("");
    try {
      const r = await fetch("/api/doctor");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as DoctorReport;
      setFresh(j);
      setMode("fresh");
    } catch (e) {
      setErr(String(e));
      setFresh(null);
    } finally {
      setLoading("idle");
    }
  }, []);

  useEffect(() => {
    void loadCache();
  }, [loadCache]);

  const cache = last?.cache;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Brain doctor</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            <strong className="text-[var(--foreground)]">Cached snapshot:</strong> read from{" "}
            <code className="text-[var(--accent)]">.brain/last-doctor.json</code> (updated when you run{" "}
            <code className="text-[var(--accent)]">brain doctor</code> without{" "}
            <code className="text-[var(--accent)]">--no-save</code>).{" "}
            <strong className="text-[var(--foreground)]">Fresh run</strong> re-executes all checks here
            (does not update the cache from the web UI).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === "fresh" && cache ? (
            <button
              type="button"
              disabled={loading !== "idle"}
              onClick={() => {
                setMode("cached");
                setFresh(null);
              }}
              className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)] disabled:opacity-50"
            >
              View cached snapshot
            </button>
          ) : null}
          <button
            type="button"
            disabled={loading !== "idle"}
            onClick={() => {
              setMode("cached");
              setFresh(null);
              void loadCache();
            }}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)] disabled:opacity-50"
          >
            Reload cache
          </button>
          <button
            type="button"
            disabled={loading !== "idle"}
            onClick={() => void loadFresh()}
            className="rounded-md bg-violet-600/90 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            Run fresh check
          </button>
        </div>
      </header>

      {err ? (
        <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      {last?.meta.error ? (
        <p className="text-sm text-amber-400/90">{last.meta.error}</p>
      ) : null}

      {mode === "cached" && last?.meta.neverRun ? (
        <div className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4 text-sm">
          No <code className="text-[var(--accent)]">.brain/last-doctor.json</code> yet. Run{" "}
          <code className="text-[var(--accent)]">brain doctor</code> from a shell (with{" "}
          <code className="text-[var(--accent)]">SECOND_BRAIN_ROOT</code> set), or use{" "}
          <strong>Run fresh check</strong> above to see live results once.
          {last.meta.hints.length ? (
            <ul className="mt-3 list-inside list-disc text-xs text-[var(--muted)]">
              {last.meta.hints.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {mode === "cached" && cache ? (
        <>
          {(last?.meta.staleByAge || (last?.meta.hints?.length ?? 0) > 0) && (
            <div className="rounded-lg border border-amber-600/40 bg-amber-950/20 p-3 text-xs text-amber-100/95">
              {last!.meta.staleByAge ? (
                <p>Cache is older than the usual freshness window or predates recent activity — run `brain doctor` again when convenient.</p>
              ) : null}
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-[var(--muted)]">
                {last!.meta.hints.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          )}

          <div
            className={`rounded-xl border p-4 ${
              cache.verdict === "blocked"
                ? "border-red-500/45 bg-red-950/25"
                : cache.verdict === "warnings"
                  ? "border-amber-500/45 bg-amber-950/20"
                  : "border-emerald-800/35 bg-emerald-950/15"
            }`}
          >
            <div className="text-xs uppercase text-[var(--muted)]">Cached summary</div>
            <p className="mt-2 text-lg font-medium">{cache.readinessLabel}</p>
            <p className="mt-1 font-mono text-xs text-[var(--muted)]">
              {cache.generatedAt.slice(0, 19).replace("T", " ")} · {cache.vaultName} ({cache.vaultNameSource})
            </p>
            <p className="mt-1 text-xs">
              Fails {cache.failCount} · Warns {cache.warnCount} · Pass {cache.passCount}
            </p>
            {cache.reportPath ? (
              <p className="mt-2 font-mono text-[10px] text-[var(--muted)]">Report: {cache.reportPath}</p>
            ) : null}
          </div>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              Sections (from cache)
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {cache.sectionStatuses.map((sec) => (
                <li
                  key={sec.id}
                  className="flex flex-wrap justify-between gap-2 border-b border-[var(--border)]/50 pb-2"
                >
                  <span className="text-[var(--foreground)]">{sec.id}</span>
                  <span
                    className={
                      sec.worst === "fail"
                        ? "text-red-400"
                        : sec.worst === "warn"
                          ? "text-amber-400"
                          : "text-emerald-400"
                    }
                  >
                    {sec.worst.toUpperCase()} (pass {sec.pass} · warn {sec.warn} · fail {sec.fail})
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              Next actions (cached)
            </h2>
            <ol className="mt-3 list-inside list-decimal space-y-1 text-sm text-[var(--muted)]">
              {cache.nextActions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ol>
          </section>
        </>
      ) : null}

      {mode === "fresh" && fresh ? (
        <>
          <div className="rounded-lg border border-sky-600/40 bg-sky-950/25 p-3 text-sm text-sky-100/90">
            Showing a <strong>fresh</strong> in-process doctor run (not written to{" "}
            <code className="text-[var(--accent)]">last-doctor.json</code> from the browser). To refresh the
            cache, run <code className="text-[var(--accent)]">brain doctor</code> in the CLI.
          </div>
          <div
            className={`rounded-xl border p-4 ${
              fresh.summary === "blocked"
                ? "border-red-500/45 bg-red-950/25"
                : fresh.summary === "warnings"
                  ? "border-amber-500/45 bg-amber-950/20"
                  : "border-emerald-800/35 bg-emerald-950/15"
            }`}
          >
            <div className="text-xs uppercase text-[var(--muted)]">Fresh summary</div>
            <p className="mt-2 text-lg font-medium">{fresh.summaryLine}</p>
            <p className="mt-1 font-mono text-xs text-[var(--muted)]">
              {fresh.generatedAt}
              {fresh.vaultRoot ? ` · ${fresh.vaultRoot}` : ""}
            </p>
          </div>
          <section className="space-y-6">
            {fresh.sections.map((sec) => (
              <div
                key={sec.title}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 p-4"
              >
                <h2 className="text-sm font-semibold text-[var(--foreground)]">{sec.title}</h2>
                <ul className="mt-3 space-y-3 text-sm">
                  {sec.checks.map((c) => (
                    <li
                      key={`${sec.title}-${c.id}`}
                      className="border-b border-[var(--border)]/40 pb-3 last:border-0"
                    >
                      <span
                        className={
                          c.status === "fail"
                            ? "text-red-400"
                            : c.status === "warn"
                              ? "text-amber-400"
                              : "text-emerald-400"
                        }
                      >
                        [{c.status.toUpperCase()}]
                      </span>{" "}
                      <span className="font-mono text-xs text-[var(--accent)]">{c.id}</span>
                      <p className="mt-1 text-[var(--muted)]">{c.message}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              Next actions
            </h2>
            <ol className="mt-3 list-inside list-decimal space-y-1 text-sm text-[var(--muted)]">
              {fresh.nextActions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ol>
          </section>
        </>
      ) : null}

      {loading !== "idle" ? (
        <p className="text-sm text-[var(--muted)]">{loading === "fresh" ? "Running doctor…" : "Loading…"}</p>
      ) : null}

      <p className="text-center text-sm text-[var(--muted)]">
        <Link href="/" className="text-sky-400 hover:underline">
          ← Home
        </Link>
      </p>
    </div>
  );
}

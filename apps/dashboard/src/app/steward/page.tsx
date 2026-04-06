"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const DOMAINS = [
  "work",
  "projects",
  "research",
  "decisions",
  "health",
  "goals",
  "writing",
  "life",
  "people",
  "topics",
] as const;

type Bundle = {
  domain: string;
  coverage: { suggestedActions?: string[]; gapScore: number } | null;
  reviewQueue: { path: string; bucket: string; priority0to100: number; why: string[] }[];
  openLoops: { title: string; sourcePath: string }[];
  conflicts: { topic: string; id: string }[];
  drift: { pagePath: string; summary: string }[];
  unsupported: { pagePath: string; reason: string }[];
  canonicalBoard: { path: string; warnings: string[] }[];
  crossSignal: { path: string; dragonScore: number; signals: string[] }[];
};

export default function StewardPage() {
  const [domain, setDomain] = useState<string>("work");
  const [data, setData] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch(`/api/steward?domain=${encodeURIComponent(domain)}`);
      const j = (await r.json().catch(() => ({}))) as Bundle & { error?: string };
      if (!r.ok) {
        setData(null);
        setLoadError(typeof j.error === "string" ? j.error : `Load failed (${r.status})`);
        return;
      }
      setData({
        domain: j.domain ?? domain,
        coverage: j.coverage ?? null,
        reviewQueue: Array.isArray(j.reviewQueue) ? j.reviewQueue : [],
        openLoops: Array.isArray(j.openLoops) ? j.openLoops : [],
        conflicts: Array.isArray(j.conflicts) ? j.conflicts : [],
        drift: Array.isArray(j.drift) ? j.drift : [],
        unsupported: Array.isArray(j.unsupported) ? j.unsupported : [],
        canonicalBoard: Array.isArray(j.canonicalBoard) ? j.canonicalBoard : [],
        crossSignal: Array.isArray(j.crossSignal) ? j.crossSignal : [],
      });
    } catch (e) {
      console.error(e);
      setData(null);
      setLoadError("Could not load steward bundle.");
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Domain steward mode</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          One domain at a time — same JSON signals as the rest of the system, scoped for a focused session.
        </p>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Domain">
          {DOMAINS.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={domain === d}
              onClick={() => setDomain(d)}
              className={`rounded-md border px-3 py-1.5 text-sm capitalize ${
                domain === d ? "border-sky-500 text-sky-300" : "border-[var(--border)]"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </header>

      {loadError ? <p className="text-sm text-red-400">{loadError}</p> : null}
      {loading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}

      {!loading && !loadError && data ? (
        <>
          <section>
            <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">Coverage hint</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Gap score:{" "}
              <strong className="text-[var(--foreground)]">{data.coverage?.gapScore?.toFixed(2) ?? "—"}</strong>
              {data.coverage?.suggestedActions?.[0] ? ` — ${data.coverage.suggestedActions[0]}` : null}
            </p>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">Cross-signal (domain)</h2>
            {data.crossSignal.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">No cross-signal rows for this domain.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {data.crossSignal.map((x) => (
                  <li key={x.path}>
                    <Link href={`/wiki?path=${encodeURIComponent(x.path)}`} className="text-sky-400">
                      {x.path}
                    </Link>
                    <span className="text-xs text-[var(--muted)]">
                      {" "}
                      — {x.dragonScore}: {x.signals.slice(0, 3).join("; ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">Review queue</h2>
              {data.reviewQueue.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--muted)]">Empty.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {data.reviewQueue.map((q) => (
                    <li key={q.path}>
                      <Link href={`/wiki?path=${encodeURIComponent(q.path)}`} className="text-sky-400">
                        {q.path}
                      </Link>
                      <span className="text-xs text-zinc-500"> {q.bucket}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">Canonical board (domain)</h2>
              {data.canonicalBoard.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--muted)]">Empty.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-xs">
                  {data.canonicalBoard.map((c) => (
                    <li key={c.path}>
                      <Link href={`/wiki?path=${encodeURIComponent(c.path)}`} className="text-sky-400">
                        {c.path}
                      </Link>
                      <div className="text-[var(--muted)]">{c.warnings.slice(0, 2).join("; ")}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">Drift</h2>
              {data.drift.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--muted)]">None open.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
                  {data.drift.map((d) => (
                    <li key={d.pagePath}>
                      <Link href={`/wiki?path=${encodeURIComponent(d.pagePath)}`} className="text-sky-400">
                        {d.pagePath}
                      </Link>{" "}
                      — {d.summary}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">Open loops</h2>
              {data.openLoops.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--muted)]">None.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {data.openLoops.map((l) => (
                    <li key={l.sourcePath + l.title}>
                      {l.title}{" "}
                      <span className="font-mono text-xs text-zinc-500">{l.sourcePath}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

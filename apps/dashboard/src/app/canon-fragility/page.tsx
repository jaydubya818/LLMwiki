"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Entry = {
  path: string;
  title: string;
  fragilityLevel: string;
  fragilityScore0to100: number;
  fragilityDrivers: string[];
  trustStatus: string;
  whyItMatters: string;
  linkedSignals: string[];
  suggestedNextAction: string;
  trendDirection?: string;
};

type FragFile = {
  version?: number;
  updatedAt: string;
  entries: Entry[];
  note: string;
  error?: string;
};

function levelStyle(level: string) {
  if (level === "critical" || level === "high") return "text-rose-300";
  if (level === "elevated") return "text-amber-300";
  if (level === "moderate") return "text-yellow-200/90";
  return "text-[var(--muted)]";
}

export default function CanonFragilityPage() {
  const [file, setFile] = useState<FragFile | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setMsg("");
    const r = await fetch("/api/canon-fragility");
    const j = (await r.json()) as FragFile & { error?: string };
    if (!r.ok || j.error || !j.updatedAt) {
      setFile(null);
      setMsg(j.error ?? "Failed to load");
      return;
    }
    setFile(j);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!file && !msg) return <p className="text-[var(--muted)]">Loading…</p>;

  if (!file) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold">Canon fragility</h1>
        <p className="text-sm text-amber-200/90">{msg}</p>
        <p className="text-xs text-[var(--muted)]">
          Run <code className="text-[var(--accent)]">brain lint</code> or{" "}
          <code className="text-[var(--accent)]">brain executive-trust</code> after a compile so inputs exist.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Canon fragility index</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Trusted or high-importance pages that may still be <strong className="text-[var(--foreground)]">brittle</strong>{" "}
          (thin support, warnings, staleness). Not the same as “untrusted” — these are priority review targets.
        </p>
        <p className="mt-1 font-mono text-xs text-[var(--muted)]">
          Updated {file.updatedAt.slice(0, 19).replace("T", " ")} · {file.entries.length} row(s)
        </p>
      </header>

      <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--card)]/20 p-3 text-xs text-[var(--muted)]">
        {file.note}
      </p>

      <div className="space-y-4">
        {file.entries.map((e) => (
          <article
            key={e.path + e.fragilityLevel}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)]/25 p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-medium text-[var(--foreground)]">{e.title}</h2>
              <span className={`text-sm font-semibold uppercase tracking-wide ${levelStyle(e.fragilityLevel)}`}>
                {e.fragilityLevel} · ~{e.fragilityScore0to100}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs text-[var(--accent)]">{e.path}</p>
            <p className="mt-2 text-sm text-[var(--foreground)]">{e.whyItMatters}</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              <span className="text-[var(--foreground)]">Trust:</span> {e.trustStatus}
              {e.trendDirection ? (
                <span className="ml-2">
                  · trend: <span className="text-[var(--foreground)]">{e.trendDirection}</span>
                </span>
              ) : null}
            </p>
            <div className="mt-2">
              <span className="text-xs font-semibold uppercase text-[var(--muted)]">Drivers</span>
              <ul className="mt-1 list-inside list-disc text-sm text-[var(--muted)]">
                {e.fragilityDrivers.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
            {e.linkedSignals?.length ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Signals:{" "}
                {e.linkedSignals.map((s, i) => (
                  <span key={s + i} className="mr-2 rounded bg-black/30 px-1.5 py-0.5">
                    {s}
                  </span>
                ))}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-emerald-200/90">
              <span className="text-xs font-semibold uppercase text-[var(--muted)]">Suggested</span>: {e.suggestedNextAction}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Link href={`/wiki?path=${encodeURIComponent(e.path)}`} className="text-sky-400">
                Open page
              </Link>
              <a href={`/api/wiki-trace?path=${encodeURIComponent(e.path)}`} className="text-sky-400">
                Inspect trace
              </a>
              <Link href="/drift" className="text-sky-400">
                Drift
              </Link>
              <Link href="/conflicts" className="text-sky-400">
                Conflicts
              </Link>
              <Link href="/unsupported-claims" className="text-sky-400">
                Unsupported
              </Link>
              <Link href="/review-session" className="text-sky-400">
                Review session
              </Link>
              <Link href="/executive-trust" className="text-sky-400">
                Exec trust
              </Link>
            </div>
          </article>
        ))}
      </div>

      <p className="text-xs text-[var(--muted)]">
        Snapshot a page before large edits from the wiki panel or CLI <code className="text-[var(--accent)]">brain snapshot</code>.
      </p>
    </div>
  );
}

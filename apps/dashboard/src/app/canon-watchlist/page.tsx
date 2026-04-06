"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Row = {
  pagePath: string;
  reasons: string[];
  severity: string;
  links: string[];
};

export default function CanonWatchlistPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch("/api/governance");
      if (!r.ok) {
        setError(`Could not load (HTTP ${r.status}).`);
        setRows([]);
        return;
      }
      const j = (await r.json()) as { canonDriftWatchlist?: { rows?: Row[] } };
      setRows(Array.isArray(j.canonDriftWatchlist?.rows) ? j.canonDriftWatchlist!.rows! : []);
    } catch (e) {
      console.error("[canon-watchlist] load:", e);
      setError(e instanceof Error ? e.message : "Network error");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function snapshot(pagePath: string) {
    try {
      const r = await fetch("/api/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "page-snapshot", pagePath, reason: "canon_watchlist" }),
      });
      if (!r.ok) {
        let err = `HTTP ${r.status}`;
        try {
          const j = (await r.json()) as { error?: string };
          err = j.error ?? err;
        } catch {
          /* ignore */
        }
        console.error("[canon-watchlist] snapshot:", err);
      }
      void load();
    } catch (e) {
      console.error("[canon-watchlist] snapshot:", e);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Canon drift watchlist</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Trusted / central / decision-linked pages that also show risk signals. Data:{" "}
          <code className="text-[var(--accent)]">.brain/canon-drift-watchlist.json</code>
        </p>
        <Link href="/governance" className="mt-2 inline-block text-xs text-sky-400">
          ← Governance hub
        </Link>
      </header>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <ul className="space-y-3">
        {rows.map((w) => (
          <li key={w.pagePath} className="rounded-lg border border-[var(--border)] bg-[var(--card)]/70 p-4 text-sm">
            <div className="font-mono text-xs text-[var(--accent)]">{w.pagePath}</div>
            <div className="mt-1 text-xs text-amber-200/90">{w.severity}</div>
            <ul className="mt-2 list-inside list-disc text-[var(--muted)]">
              {w.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <div className="mt-2 text-xs text-[var(--muted)]">Links: {w.links.join(", ") || "—"}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`/wiki?path=${encodeURIComponent(w.pagePath)}`} className="text-xs text-sky-400">
                Open page
              </a>
              <button
                type="button"
                className="rounded bg-zinc-700 px-2 py-1 text-xs"
                onClick={() => void snapshot(w.pagePath)}
              >
                Snapshot copy
              </button>
            </div>
          </li>
        ))}
      </ul>
      {rows.length === 0 && !error ? (
        <p className="text-sm text-[var(--muted)]">Empty — run governance refresh after wiki/trust activity.</p>
      ) : null}
    </div>
  );
}

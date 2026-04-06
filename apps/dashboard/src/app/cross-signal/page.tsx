"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Item = { path: string; dragonScore: number; signals: string[]; headline: string };

export default function CrossSignalPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/cross-signal");
        if (!r.ok) {
          setError(`Could not load (HTTP ${r.status}).`);
          setItems([]);
          return;
        }
        const j = (await r.json()) as { items?: Item[] };
        setItems(Array.isArray(j.items) ? j.items : []);
      } catch (e) {
        console.error("[cross-signal]:", e);
        setError(e instanceof Error ? e.message : "Network error");
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Cross-signal correlation</h1>
      <p className="text-sm text-[var(--muted)]">
        Pages where several weak signals overlap (quality, evidence density, drift, conflicts, centrality, etc.).
        Requires two or more contributing factors so the list stays meaningful.
      </p>
      {loading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      <ol className="space-y-4">
        {items.map((it, i) => (
          <li key={it.path} className="rounded-lg border border-[var(--border)] bg-[var(--card)]/40 p-4 text-sm">
            <div className="flex justify-between gap-2 text-xs text-zinc-500">
              <span>#{i + 1}</span>
              <span>score {it.dragonScore}</span>
            </div>
            <Link href={`/wiki?path=${encodeURIComponent(it.path)}`} className="mt-1 font-mono text-sm text-sky-400">
              {it.path}
            </Link>
            <p className="mt-2 text-[var(--foreground)]">{it.headline}</p>
            <ul className="mt-2 list-inside list-disc text-xs text-[var(--muted)]">
              {it.signals.map((s, j) => (
                <li key={j}>{s}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

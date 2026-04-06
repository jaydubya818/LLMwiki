"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Cell = {
  domain: string;
  synthesisGap: number;
  rawCount: number;
  wikiCount: number;
  avgQuality?: number;
  unsupportedOpen: number;
  driftOpen: number;
  conflictsOpen: number;
  hint: string;
};

export default function HeatmapPage() {
  const [cells, setCells] = useState<Cell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/synthesis-heatmap");
        if (!r.ok) {
          setError(`Could not load (HTTP ${r.status}).`);
          setCells([]);
          return;
        }
        const j = (await r.json()) as { cells?: Cell[] };
        setCells(Array.isArray(j.cells) ? j.cells : []);
      } catch (e) {
        console.error("[heatmap]:", e);
        setError(e instanceof Error ? e.message : "Network error");
        setCells([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const maxGap = Math.max(0.01, ...cells.map((c) => c.synthesisGap));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">Synthesis coverage heatmap</h1>
      <p className="text-sm text-[var(--muted)]">
        Darker = higher synthesis gap heuristic (raw vs wiki + quality + queue signals). Use{" "}
        <Link href="/operations" className="text-sky-400">
          Operations → Refresh
        </Link>{" "}
      </p>
      {loading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {!loading && !error && cells.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No cells yet — run operational refresh.</p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
              <th className="py-2 pr-4">Domain</th>
              <th className="py-2">Gap</th>
              <th className="py-2">Raw / Wiki</th>
              <th className="py-2">Quality Ø</th>
              <th className="py-2">Queues</th>
              <th className="py-2">Hint</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((c) => {
              const intensity = c.synthesisGap / maxGap;
              return (
                <tr key={c.domain} className="border-b border-[var(--border)]/60">
                  <td className="py-3 pr-4 font-medium capitalize">{c.domain}</td>
                  <td className="py-3">
                    <div
                      className="h-6 max-w-[120px] rounded"
                      style={{
                        background: `color-mix(in srgb, rgb(220, 38, 38) ${Math.round(intensity * 85)}%, transparent)`,
                      }}
                      title={`${c.synthesisGap}`}
                    />
                  </td>
                  <td className="py-3 text-xs text-[var(--muted)]">
                    {c.rawCount} / {c.wikiCount}
                  </td>
                  <td className="py-3 text-xs">{c.avgQuality ?? "—"}</td>
                  <td className="py-3 text-xs text-[var(--muted)]">
                    u{c.unsupportedOpen} d{c.driftOpen} c{c.conflictsOpen}
                  </td>
                  <td className="py-3 text-xs text-[var(--muted)]">{c.hint}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--muted)]">
        <Link href="/operations" className="text-sky-400">
          Refresh operational intelligence
        </Link>{" "}
        after ingest for up-to-date cells.
      </p>
    </div>
  );
}

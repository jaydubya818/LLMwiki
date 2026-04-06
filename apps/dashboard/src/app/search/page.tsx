"use client";

import { useCallback, useState } from "react";

type Hit = {
  path: string;
  kind: string;
  score: number;
  preview: string;
  freshness?: { category: string; explain: string };
};
type CrossHit = { brain: string; hit: Hit };

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("all");
  const [hits, setHits] = useState<Hit[]>([]);
  const [crossHits, setCrossHits] = useState<CrossHit[]>([]);
  const [mode, setMode] = useState<"single" | "allBrains" | null>(null);
  const [brainLabel, setBrainLabel] = useState<string | null>(null);
  const [allBrains, setAllBrains] = useState(false);
  const [err, setErr] = useState("");

  const run = useCallback(async () => {
    setErr("");
    const all = allBrains ? "&allBrains=1" : "";
    const r = await fetch(
      `/api/search?q=${encodeURIComponent(q)}&scope=${encodeURIComponent(scope)}${all}`
    );
    const j = await r.json();
    if (!r.ok) {
      setErr(j.error ?? "search failed");
      return;
    }
    setMode(j.mode ?? "single");
    setBrainLabel(j.brainName ?? null);
    if (j.mode === "allBrains") {
      setCrossHits(j.hits ?? []);
      setHits([]);
    } else {
      setHits(j.hits ?? []);
      setCrossHits([]);
    }
  }, [q, scope, allBrains]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Search</h1>
      <p className="text-xs text-[var(--muted)]">
        {mode === "allBrains"
          ? "Cross-brain search (opt-in; workspace only)"
          : brainLabel
            ? `Scoped to brain: ${brainLabel}`
            : null}
      </p>
      <div className="flex flex-wrap gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Query"
          className="min-w-[240px] flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
        />
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
        >
          <option value="all">All</option>
          <option value="wiki">Wiki first-class</option>
          <option value="raw">Raw</option>
          <option value="output">Outputs</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={allBrains}
            onChange={(e) => setAllBrains(e.target.checked)}
          />
          All brains
        </label>
        <button
          type="button"
          onClick={() => void run()}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white"
        >
          Search
        </button>
      </div>
      {err ? <p className="text-sm text-red-400">{err}</p> : null}
      <ul className="space-y-3">
        {(
          mode === "allBrains"
            ? crossHits.map((c) => ({ brain: c.brain as string | null, hit: c.hit }))
            : hits.map((h) => ({ brain: null as string | null, hit: h }))
        ).map((row, i) => {
          const { brain, hit: h } = row;
          const key = brain ? `${brain}-${h.path}-${i}` : `${h.path}-${i}`;
          return (
            <li
              key={key}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)]/70 p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-sm text-[var(--accent)]">{h.path}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                  {h.kind === "wiki" && h.freshness ? (
                    <span
                      className="rounded border border-[var(--border)] px-1.5 py-0.5 capitalize text-[10px] text-[var(--foreground)]"
                      title={h.freshness.explain}
                    >
                      {h.freshness.category}
                    </span>
                  ) : null}
                  {brain ? `${brain} · ` : ""}
                  {h.kind} · score {h.score.toFixed(1)}
                </span>
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">{h.preview}</p>
              {h.kind === "wiki" ? (
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <a
                    href={`/wiki?path=${encodeURIComponent(h.path)}`}
                    className="text-sky-400 hover:underline"
                  >
                    Open in wiki
                  </a>
                  <a
                    href={`/wiki?path=${encodeURIComponent(h.path)}&panel=trace`}
                    className="text-emerald-400 hover:underline"
                    title="Scrolls to claim trace panel when a sidecar exists"
                  >
                    Wiki + trace panel
                  </a>
                </div>
              ) : (
                <a
                  href={`/wiki?path=${encodeURIComponent(h.path)}`}
                  className="mt-2 inline-block text-xs text-sky-400 hover:underline"
                >
                  Open in wiki viewer
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

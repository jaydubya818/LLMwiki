"use client";

import { useState } from "react";

type TracePayload = {
  influence?: { wikiPages: string[]; outputs: string[]; decisions: string[] };
  source?: string;
  error?: string;
  supersessionHints?: Array<{
    id: string;
    olderSource: string;
    newerSource: string;
    topic: string;
    confidence: string;
    reason: string;
    status: string;
  }>;
};

export default function SourceTracePage() {
  const [raw, setRaw] = useState("raw/inbox/example.md");
  const [data, setData] = useState<TracePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    const p = raw.trim();
    if (!p) {
      setErr("Enter a raw path.");
      setData(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/source-trace?raw=${encodeURIComponent(p)}`);
      const j = (await r.json().catch(() => ({}))) as TracePayload;
      if (!r.ok) {
        setData(null);
        setErr(typeof j.error === "string" ? j.error : `Trace failed (${r.status})`);
        return;
      }
      if (typeof j.error === "string") {
        setErr(j.error);
        setData(null);
        return;
      }
      setData(j);
    } catch (e) {
      console.error(e);
      setErr("Could not trace source.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Source → wiki trace</h1>
      <p className="text-sm text-[var(--muted)]">
        Answer: &quot;What did this raw file influence?&quot; Built from frontmatter{" "}
        <code className="text-[var(--accent)]">sources</code> across wiki and outputs. Refresh operational data after
        ingest.
      </p>
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="source-trace-raw">
          Raw file path
        </label>
        <input
          id="source-trace-raw"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          className="min-w-[240px] flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-mono text-xs"
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => void go()}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Tracing…" : "Trace"}
        </button>
      </div>
      {err ? <p className="text-sm text-red-400">{err}</p> : null}
      {data?.supersessionHints?.length ? (
        <div className="rounded-lg border border-amber-900/35 bg-amber-950/20 p-4 text-sm">
          <div className="text-xs font-semibold uppercase text-[var(--muted)]">Source supersession (heuristic)</div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Same-folder dated filenames may indicate a newer note supersedes an older one — confirm before treating as
            truth.
          </p>
          <ul className="mt-3 space-y-2">
            {data.supersessionHints.map((h) => (
              <li key={h.id} className="rounded border border-[var(--border)] bg-[var(--card)]/40 p-2 text-xs">
                <span className="text-[var(--muted)]">{h.status}</span> · {h.confidence} · {h.reason}
                <div className="mt-1 font-mono">
                  <span className="text-zinc-400">{h.olderSource}</span>
                  <span className="mx-1 text-[var(--muted)]">→</span>
                  <span className="text-sky-400">{h.newerSource}</span>
                </div>
              </li>
            ))}
          </ul>
          <a href="/operations" className="mt-2 inline-block text-xs text-sky-500">
            Refresh operational data if empty after ingest
          </a>
        </div>
      ) : null}
      {data?.influence ? (
        <div className="space-y-4 text-sm">
          <div>
            <div className="text-xs uppercase text-[var(--muted)]">Wiki pages</div>
            <ul className="mt-1 list-inside list-disc font-mono text-xs text-[var(--accent)]">
              {(data.influence.wikiPages ?? []).map((p: string) => (
                <li key={p}>
                  <a href={`/wiki?path=${encodeURIComponent(p)}`} className="text-sky-400">
                    {p}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase text-[var(--muted)]">Outputs</div>
            <ul className="mt-1 list-inside list-disc font-mono text-xs">
              {(data.influence.outputs ?? []).map((p: string) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase text-[var(--muted)]">Decisions</div>
            <ul className="mt-1 list-inside list-disc font-mono text-xs">
              {(data.influence.decisions ?? []).map((p: string) => (
                <li key={p}>
                  <a href={`/wiki?path=${encodeURIComponent(p)}`} className="text-sky-400">
                    {p}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {!loading && !err && data && !data.influence && !data.supersessionHints?.length ? (
        <p className="text-sm text-[var(--muted)]">No influence data for this path (try refresh).</p>
      ) : null}
    </div>
  );
}

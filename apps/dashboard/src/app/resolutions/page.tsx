"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Rec = {
  id: string;
  type: string;
  relatedIds: string[];
  relatedPagePaths: string[];
  issueSummary: string;
  decision: string;
  rationale: string;
  resolvedBy: string;
  resolvedAt: string;
  followUp?: string;
  linkedDecisionPath?: string;
};

export default function ResolutionsPage() {
  const [items, setItems] = useState<Rec[]>([]);
  const [type, setType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const q = type === "all" ? "" : `?type=${encodeURIComponent(type)}`;
        const r = await fetch(`/api/resolutions${q}`, { signal: ac.signal });
        const j = (await r.json().catch(() => ({}))) as { items?: Rec[]; error?: string };
        if (ac.signal.aborted) return;
        if (!r.ok) {
          setLoadError(typeof j.error === "string" ? j.error : `Load failed (${r.status})`);
          setItems([]);
          return;
        }
        setItems(Array.isArray(j.items) ? j.items : []);
      } catch (e) {
        if (ac.signal.aborted) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error(e);
        setLoadError("Could not load resolutions.");
        setItems([]);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [type]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Resolution memory</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Why trust issues were closed. Also written when you resolve conflicts/drift/unsupported with optional
          resolution note from those views (API: <code className="text-[var(--accent)]">saveResolution</code>).
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {(["all", "conflict", "drift", "unsupported-claim", "canonical-update", "other"] as const).map(
            (t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded border px-2 py-1 ${type === t ? "border-sky-500" : "border-[var(--border)]"}`}
              >
                {t}
              </button>
            )
          )}
        </div>
      </header>
      {loadError ? <p className="text-sm text-red-400">{loadError}</p> : null}
      {loading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
      {!loading && !loadError && items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No resolutions for this filter.</p>
      ) : null}
      <ul className="space-y-4 text-sm">
        {items.map((x) => (
          <li key={x.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)]/40 p-4">
            <div className="text-xs uppercase text-[var(--muted)]">
              {x.type} · {x.resolvedAt.slice(0, 19)} · {x.resolvedBy}
            </div>
            <p className="mt-2 text-[var(--foreground)]">{x.issueSummary}</p>
            <p className="mt-2">
              <span className="text-[var(--muted)]">Decision:</span> {x.decision}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">{x.rationale}</p>
            {x.followUp ? (
              <p className="mt-2 text-xs text-amber-200/90">Follow-up: {x.followUp}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2 font-mono text-xs text-[var(--accent)]">
              {x.relatedPagePaths.map((p) => (
                <Link key={p} href={`/wiki?path=${encodeURIComponent(p)}`} className="text-sky-400">
                  {p}
                </Link>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

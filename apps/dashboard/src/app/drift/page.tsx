"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type D = {
  id: string;
  pagePath: string;
  summary: string;
  likelyCause: string;
  severity: string;
  status: string;
};

type Bridge = {
  driftId: string;
  pagePath: string;
  driftSummary: string;
  decisionPaths: string[];
  elevation: string;
};

export default function DriftPage() {
  const [items, setItems] = useState<D[]>([]);
  const [bridge, setBridge] = useState<Bridge[]>([]);
  const [mem, setMem] = useState<Record<string, { decision: string; rationale: string }>>({});
  const [updating, setUpdating] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const errs: string[] = [];
    try {
      const [r, b] = await Promise.all([
        fetch("/api/knowledge-drift"),
        fetch("/api/drift-decision-bridge"),
      ]);
      if (!r.ok) {
        setItems([]);
        errs.push(`drift HTTP ${r.status}`);
      } else {
        try {
          const j = (await r.json()) as { items?: D[] };
          setItems(Array.isArray(j.items) ? j.items : []);
        } catch {
          setItems([]);
          errs.push("drift response invalid");
        }
      }
      if (!b.ok) {
        setBridge([]);
        errs.push(`bridge HTTP ${b.status}`);
      } else {
        try {
          const bj = (await b.json()) as { links?: Bridge[] };
          setBridge(Array.isArray(bj.links) ? bj.links : []);
        } catch {
          setBridge([]);
          errs.push("bridge response invalid");
        }
      }
      if (errs.length) setLoadError(errs.join("; "));
    } catch (e) {
      console.error("[drift] load:", e);
      setLoadError(e instanceof Error ? e.message : "Network error");
      setItems([]);
      setBridge([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(id: string, status: string) {
    if (updating) return;
    setUpdating(id);
    const m = mem[id];
    const saveResolution =
      (status === "resolved" || status === "ignored") && m?.decision?.trim() && m?.rationale?.trim()
        ? { decision: m.decision.trim(), rationale: m.rationale.trim() }
        : undefined;
    try {
      const res = await fetch("/api/knowledge-drift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, saveResolution }),
      });
      if (!res.ok) {
        let err = `HTTP ${res.status}`;
        try {
          const j = (await res.json()) as { error?: string };
          err = j.error ?? err;
        } catch {
          /* ignore */
        }
        console.error("[drift] update failed:", err);
      }
      void load();
    } catch (e) {
      console.error("[drift] update:", e);
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Knowledge drift</h1>
      <p className="text-sm text-[var(--muted)]">
        Flags pages whose wiki mtime lags noticeably behind raw activity in the same domain folder — &quot;likely needs
        review&quot;, not &quot;wrong&quot;.
      </p>
      {loadError ? <p className="text-sm text-rose-400">{loadError}</p> : null}
      {bridge.length ? (
        <section className="rounded-lg border border-rose-900/35 bg-rose-950/20 p-4 text-sm">
          <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">Drift → decision bridge</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Drift items that may affect decision pages (ledger / wiki/decisions / related links).
          </p>
          <ul className="mt-3 space-y-2">
            {bridge.slice(0, 12).map((l) => (
              <li key={l.driftId}>
                <Link href={`/wiki?path=${encodeURIComponent(l.pagePath)}`} className="text-sky-400">
                  {l.pagePath}
                </Link>
                <div className="text-xs text-[var(--muted)]">
                  {l.elevation} · {l.driftSummary.slice(0, 120)}
                </div>
                <div className="text-xs">
                  Decisions:{" "}
                  {l.decisionPaths.map((p) => (
                    <Link key={p} href={`/wiki?path=${encodeURIComponent(p)}`} className="mr-2 text-emerald-400">
                      {p}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <Link href="/decisions" className="mt-3 inline-block text-xs text-sky-500">
            Decision ledger →
          </Link>
        </section>
      ) : null}
      <ul className="space-y-3 text-sm">
        {items.map((d) => (
          <li key={d.id} className="rounded-lg border border-amber-900/30 bg-amber-950/15 p-4">
            <div className="font-mono text-xs text-[var(--accent)]">{d.pagePath}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">
              {d.severity} · {d.status}
            </div>
            <p className="mt-2">{d.summary}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{d.likelyCause}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Link href={`/wiki?path=${encodeURIComponent(d.pagePath)}`} className="text-sky-400">
                Open wiki
              </Link>
              <button
                type="button"
                disabled={updating === d.id}
                className="text-amber-300 disabled:opacity-50"
                onClick={() => void setStatus(d.id, "reviewing")}
              >
                Reviewing
              </button>
              <button
                type="button"
                disabled={updating === d.id}
                className="text-emerald-400 disabled:opacity-50"
                onClick={() => void setStatus(d.id, "resolved")}
              >
                Resolved
              </button>
              <button
                type="button"
                disabled={updating === d.id}
                className="text-zinc-500 disabled:opacity-50"
                onClick={() => void setStatus(d.id, "ignored")}
              >
                Ignore
              </button>
            </div>
            <details className="mt-2 rounded border border-[var(--border)] border-dashed p-2 text-xs">
              <summary className="cursor-pointer text-[var(--muted)]">Resolution memory (optional)</summary>
              <label className="mt-2 block">
                Decision
                <input
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1"
                  value={mem[d.id]?.decision ?? ""}
                  onChange={(e) =>
                    setMem((p) => ({
                      ...p,
                      [d.id]: { decision: e.target.value, rationale: p[d.id]?.rationale ?? "" },
                    }))
                  }
                />
              </label>
              <label className="mt-2 block">
                Rationale
                <textarea
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1"
                  rows={2}
                  value={mem[d.id]?.rationale ?? ""}
                  onChange={(e) =>
                    setMem((p) => ({
                      ...p,
                      [d.id]: { decision: p[d.id]?.decision ?? "", rationale: e.target.value },
                    }))
                  }
                />
              </label>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

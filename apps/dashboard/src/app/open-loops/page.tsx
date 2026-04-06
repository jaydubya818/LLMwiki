"use client";

import { useCallback, useEffect, useState } from "react";

type L = {
  id: string;
  title: string;
  sourcePath: string;
  loopType: string;
  domain: string;
  status: string;
  priority?: string;
};

export default function OpenLoopsPage() {
  const [items, setItems] = useState<L[]>([]);
  const [domainInput, setDomainInput] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDomainFilter(domainInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [domainInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const q = domainFilter ? `?domain=${encodeURIComponent(domainFilter)}` : "";
      const r = await fetch(`/api/open-loops${q}`);
      const j = (await r.json()) as { items?: L[]; error?: string };
      if (!r.ok) {
        setLoadError(typeof j.error === "string" ? j.error : `Request failed (${r.status})`);
        setItems([]);
        return;
      }
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch (e) {
      console.error(e);
      setLoadError("Could not load open loops.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [domainFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setSt(id: string, status: string) {
    setActionError(null);
    setUpdatingId(id);
    try {
      const r = await fetch("/api/open-loops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; ok?: boolean };
      if (!r.ok) {
        setActionError(typeof j.error === "string" ? j.error : `Update failed (${r.status})`);
        return;
      }
      void load();
    } catch (e) {
      console.error(e);
      setActionError("Could not update status.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Open loops</h1>
      <p className="text-sm text-[var(--muted)]">
        Lightweight follow-ups scraped from headings/lines — not a task manager. Refresh from Operations.
      </p>
      <label className="block text-xs text-[var(--muted)]" htmlFor="open-loops-domain">
        Filter domain (optional)
      </label>
      <input
        id="open-loops-domain"
        value={domainInput}
        onChange={(e) => setDomainInput(e.target.value)}
        placeholder="e.g. work — applies after you pause typing"
        aria-label="Filter open loops by domain"
        autoComplete="off"
        className="mt-1 w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
      />
      {loadError ? <p className="text-sm text-red-400">{loadError}</p> : null}
      {actionError ? <p className="text-sm text-amber-300">{actionError}</p> : null}
      {loading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
      {!loading && !loadError && items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          No open loops
          {domainFilter ? ` for domain “${domainFilter}”` : ""}.
        </p>
      ) : null}
      <ul className="space-y-2 text-sm">
        {items.map((l) => (
          <li key={l.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)]/40 p-3">
            <div className="font-medium">{l.title}</div>
            <div className="mt-1 font-mono text-xs text-[var(--accent)]">{l.sourcePath}</div>
            <div className="text-xs text-[var(--muted)]">
              {l.loopType} · {l.domain} · {l.status}
              {l.priority ? ` · ${l.priority}` : ""}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                className="text-sky-400 disabled:opacity-40"
                disabled={updatingId === l.id}
                onClick={() => void setSt(l.id, "in-progress")}
              >
                In progress
              </button>
              <button
                type="button"
                className="text-emerald-400 disabled:opacity-40"
                disabled={updatingId === l.id}
                onClick={() => void setSt(l.id, "resolved")}
              >
                Resolved
              </button>
              <button
                type="button"
                className="text-zinc-500 disabled:opacity-40"
                disabled={updatingId === l.id}
                onClick={() => void setSt(l.id, "ignored")}
              >
                Ignore
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

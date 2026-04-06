"use client";

import { useCallback, useEffect, useState } from "react";

type Item = {
  id: string;
  pagePath: string;
  excerpt: string;
  reason: string;
  severity: string;
  sourceCount: number;
  status: string;
};

function msgIsError(text: string) {
  return /fail|error|invalid|required|missing|not found|could not|couldn't|unable to|failed to/i.test(
    text
  );
}

export default function UnsupportedClaimsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState("");
  const [msg, setMsg] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mem, setMem] = useState<Record<string, { decision: string; rationale: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const q = status ? `?status=${encodeURIComponent(status)}` : "";
      const r = await fetch(`/api/unsupported-claims${q}`);
      const j = (await r.json().catch(() => ({}))) as { items?: Item[]; error?: string };
      if (!r.ok) {
        setLoadError(typeof j.error === "string" ? j.error : `Load failed (${r.status})`);
        setItems([]);
        return;
      }
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch (e) {
      console.error(e);
      setLoadError("Could not load unsupported claims.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setSt(id: string, s: string) {
    setMsg("");
    const m = mem[id];
    const saveResolution =
      (s === "resolved" || s === "ignored") && m?.decision?.trim() && m?.rationale?.trim()
        ? { decision: m.decision.trim(), rationale: m.rationale.trim() }
        : undefined;
    try {
      const r = await fetch("/api/unsupported-claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: s, saveResolution }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setMsg(r.ok ? "Updated" : (typeof j.error === "string" ? j.error : `Update failed (${r.status})`));
    } catch (e) {
      console.error(e);
      setMsg("Could not update item.");
    }
    void load();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Unsupported claim queue</h1>
      <p className="text-sm text-[var(--muted)]">
        Conservative flags from trace, sources, and decision-like language. Goal: fewer, sharper items — refresh from{" "}
        <a href="/operations" className="text-sky-400">
          Operations
        </a>
        .
      </p>
      <select
        id="unsupported-claims-status"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        aria-label="Filter by status"
        className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-sm"
      >
        <option value="">All statuses</option>
        <option value="new">new</option>
        <option value="reviewing">reviewing</option>
        <option value="resolved">resolved</option>
        <option value="ignored">ignored</option>
      </select>
      {loadError ? <p className="text-sm text-red-400">{loadError}</p> : null}
      {loading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
      {msg ? (
        <p className={`text-xs ${msgIsError(msg) ? "text-red-400" : "text-emerald-400"}`}>{msg}</p>
      ) : null}
      {!loading && !loadError && items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No items for this filter.</p>
      ) : null}
      <ul className="space-y-3 text-sm">
        {items.map((i) => (
          <li key={i.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)]/50 p-4">
            <div className="font-mono text-xs text-[var(--accent)]">{i.pagePath}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">
              {i.severity} · sources {i.sourceCount} · {i.status}
            </div>
            <p className="mt-2 text-[var(--muted)]">{i.reason}</p>
            <blockquote className="mt-2 border-l-2 border-zinc-600 pl-3 text-xs italic">{i.excerpt}</blockquote>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`/wiki?path=${encodeURIComponent(i.pagePath)}`} className="text-xs text-sky-400">
                Wiki
              </a>
              <a href={`/api/wiki-trace?path=${encodeURIComponent(i.pagePath)}`} className="text-xs text-sky-400">
                Trace JSON
              </a>
              <button type="button" className="text-xs text-amber-300" onClick={() => void setSt(i.id, "reviewing")}>
                Reviewing
              </button>
              <button type="button" className="text-xs text-emerald-400" onClick={() => void setSt(i.id, "resolved")}>
                Resolved
              </button>
              <button type="button" className="text-xs text-zinc-400" onClick={() => void setSt(i.id, "ignored")}>
                Ignore
              </button>
            </div>
            <details className="mt-3 rounded border border-[var(--border)] border-dashed p-2 text-xs">
              <summary className="cursor-pointer text-[var(--muted)]">Resolution memory (optional)</summary>
              <label className="mt-2 block">
                <span className="text-[var(--muted)]">Decision</span>
                <input
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1"
                  value={mem[i.id]?.decision ?? ""}
                  onChange={(e) =>
                    setMem((p) => ({
                      ...p,
                      [i.id]: { decision: e.target.value, rationale: p[i.id]?.rationale ?? "" },
                    }))
                  }
                />
              </label>
              <label className="mt-2 block">
                <span className="text-[var(--muted)]">Rationale</span>
                <textarea
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1"
                  rows={2}
                  value={mem[i.id]?.rationale ?? ""}
                  onChange={(e) =>
                    setMem((p) => ({
                      ...p,
                      [i.id]: { decision: p[i.id]?.decision ?? "", rationale: e.target.value },
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

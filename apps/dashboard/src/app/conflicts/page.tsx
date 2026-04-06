"use client";

import { useCallback, useEffect, useState } from "react";

type C = {
  id: string;
  topic: string;
  summary: string;
  sourceA: string;
  sourceB: string;
  status: string;
  excerptA?: string;
  excerptB?: string;
  clarity: string;
};

export default function ConflictsPage() {
  const [items, setItems] = useState<C[]>([]);
  const [msg, setMsg] = useState("");
  const [msgIsError, setMsgIsError] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mem, setMem] = useState<Record<string, { decision: string; rationale: string }>>({});

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await fetch("/api/conflicts");
      if (!r.ok) {
        setLoadError(`Could not load conflicts (HTTP ${r.status}).`);
        setItems([]);
        return;
      }
      const j = (await r.json()) as { items?: C[] };
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch (e) {
      console.error("[conflicts] load:", e);
      setLoadError(e instanceof Error ? e.message : "Network error");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resolutionPayload(id: string) {
    const m = mem[id];
    if (m?.decision?.trim() && m?.rationale?.trim()) {
      return { decision: m.decision.trim(), rationale: m.rationale.trim() };
    }
    return undefined;
  }

  async function post(body: Record<string, unknown>) {
    setMsg("");
    setMsgIsError(false);
    try {
      const r = await fetch("/api/conflicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let j: { error?: string } = {};
      try {
        j = (await r.json()) as typeof j;
      } catch {
        setMsg(r.ok ? "OK" : "Could not parse response.");
        setMsgIsError(!r.ok);
        void load();
        return;
      }
      if (r.ok) {
        setMsg("OK");
        setMsgIsError(false);
      } else {
        setMsg(j.error ?? "Unknown error");
        setMsgIsError(true);
      }
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Network error");
      setMsgIsError(true);
      void load();
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">Conflict resolver</h1>
      <p className="max-w-3xl text-sm text-[var(--muted)]">
        Heuristic tensions only (e.g. opposing <code className="text-[var(--accent)]">status</code> values on linked wiki
        pages). Not automated truth — use this to decide what to reconcile manually.
      </p>
      {loadError ? <p className="text-xs text-rose-400">{loadError}</p> : null}
      {msg ? (
        <p className={msgIsError ? "text-xs text-rose-400" : "text-xs text-emerald-400"}>{msg}</p>
      ) : null}
      <ul className="space-y-4 text-sm">
        {items.map((c) => (
          <li key={c.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)]/50 p-4">
            <div className="font-medium">{c.topic}</div>
            <p className="mt-2 text-[var(--muted)]">{c.summary}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded bg-black/25 p-3 text-xs">
                <div className="font-mono text-[var(--accent)]">{c.sourceA}</div>
                <p className="mt-2 text-[var(--muted)]">{c.excerptA}</p>
              </div>
              <div className="rounded bg-black/25 p-3 text-xs">
                <div className="font-mono text-[var(--accent)]">{c.sourceB}</div>
                <p className="mt-2 text-[var(--muted)]">{c.excerptB}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="text-[var(--muted)]">{c.status} · clarity {c.clarity}</span>
              <button type="button" className="text-sky-400" onClick={() => void post({ id: c.id, status: "reviewing" })}>
                Reviewing
              </button>
              <button
                type="button"
                className="text-emerald-400"
                onClick={() =>
                  void post({
                    id: c.id,
                    status: "accepted-as-tension",
                    saveResolution: resolutionPayload(c.id),
                  })
                }
              >
                Accepted tension
              </button>
              <button
                type="button"
                className="text-zinc-400"
                onClick={() =>
                  void post({
                    id: c.id,
                    status: "ignored",
                    saveResolution: resolutionPayload(c.id),
                  })
                }
              >
                Ignore
              </button>
              <button
                type="button"
                className="text-amber-300"
                onClick={() => {
                  const note = window.prompt("Resolution note (appends to wiki via first listed page)");
                  if (note)
                    void post({
                      action: "append-note",
                      id: c.id,
                      resolutionNote: note,
                      targetWikiRel: c.sourceA,
                    });
                }}
              >
                Resolve + note
              </button>
            </div>
            <details className="mt-3 rounded border border-[var(--border)] border-dashed p-2 text-xs">
              <summary className="cursor-pointer text-[var(--muted)]">Resolution memory (optional)</summary>
              <p className="mt-2 text-[var(--muted)]">
                If you fill both fields, a record is saved to <code className="text-[var(--accent)]">.brain/resolutions.json</code>{" "}
                when you choose Ignore or Accepted tension.
              </p>
              <label className="mt-2 block">
                <span className="text-[var(--muted)]">Decision</span>
                <input
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 font-sans"
                  value={mem[c.id]?.decision ?? ""}
                  onChange={(e) =>
                    setMem((prev) => ({
                      ...prev,
                      [c.id]: { decision: e.target.value, rationale: prev[c.id]?.rationale ?? "" },
                    }))
                  }
                />
              </label>
              <label className="mt-2 block">
                <span className="text-[var(--muted)]">Rationale</span>
                <textarea
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 font-sans"
                  rows={2}
                  value={mem[c.id]?.rationale ?? ""}
                  onChange={(e) =>
                    setMem((prev) => ({
                      ...prev,
                      [c.id]: { decision: prev[c.id]?.decision ?? "", rationale: e.target.value },
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

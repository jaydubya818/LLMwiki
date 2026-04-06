"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Hint = {
  id: string;
  decisionWikiPath: string;
  decisionTitle: string;
  summary: string;
  whyFlagged: string[];
  ageDaysApprox?: number;
  suggestedNext: string;
  status: string;
};

export default function DecisionSunsetPage() {
  const [hints, setHints] = useState<Hint[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await fetch("/api/decision-sunset");
      let j: { hints?: Hint[]; error?: string } = {};
      try {
        j = (await r.json()) as typeof j;
      } catch (e) {
        console.error("[decision-sunset] load JSON:", e);
        setLoadError("Invalid response from server.");
        setHints([]);
        return;
      }
      if (!r.ok) {
        setLoadError(typeof j.error === "string" ? j.error : `Load failed (HTTP ${r.status})`);
        setHints([]);
        return;
      }
      setHints(Array.isArray(j.hints) ? j.hints : []);
    } catch (e) {
      console.error("[decision-sunset] load:", e);
      setLoadError(e instanceof Error ? e.message : "Network error");
      setHints([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(id: string, status: string) {
    setUpdateError(null);
    const rationale = (notes[id] ?? "").trim();
    try {
      const r = await fetch("/api/decision-sunset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, rationale: rationale || undefined }),
      });
      let j: { error?: string } = {};
      try {
        j = (await r.json()) as typeof j;
      } catch (e) {
        console.error("[decision-sunset] update JSON:", e);
        setUpdateError(r.ok ? "Invalid response from server." : `HTTP ${r.status}`);
        return;
      }
      if (!r.ok) {
        setUpdateError(typeof j.error === "string" ? j.error : `Update failed (HTTP ${r.status})`);
        return;
      }
      void load();
    } catch (e) {
      console.error("[decision-sunset] update:", e);
      setUpdateError(e instanceof Error ? e.message : "Network error");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Decision sunset hints</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Old or stressed decisions that may deserve revalidation — <code className="text-[var(--accent)]">.brain/decision-sunset.json</code>
        </p>
        <div className="mt-2 flex gap-3 text-xs text-sky-400">
          <Link href="/decisions">Decision ledger</Link>
          <Link href="/executive">Executive</Link>
        </div>
      </header>

      {loadError ? <p className="text-sm text-red-400">{loadError}</p> : null}
      {updateError ? <p className="text-sm text-amber-300">{updateError}</p> : null}

      <ul className="space-y-4">
        {hints.map((h) => (
          <li key={h.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)]/50 p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <Link href={`/wiki?path=${encodeURIComponent(h.decisionWikiPath)}`} className="font-medium text-sky-400">
                {h.decisionTitle}
              </Link>
              <span className="text-xs text-[var(--muted)]">
                {h.ageDaysApprox != null ? `~${h.ageDaysApprox}d · ` : ""}
                {h.status}
              </span>
            </div>
            <p className="mt-2 text-[var(--muted)]">{h.summary}</p>
            <ul className="mt-2 list-inside list-disc text-xs text-amber-200/80">
              {h.whyFlagged.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <p className="mt-2 text-sky-300/90">{h.suggestedNext}</p>
            <label className="mt-2 block text-xs text-[var(--muted)]">
              Optional rationale (logged to human overrides)
              <input
                value={notes[h.id] ?? ""}
                onChange={(e) => setNotes((m) => ({ ...m, [h.id]: e.target.value }))}
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 font-mono text-xs"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["reviewing", "revalidated", "superseded", "ignored", "new"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  className="rounded border border-[var(--border)] px-2 py-1 text-xs"
                  onClick={() => void setStatus(h.id, st)}
                >
                  {st}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {hints.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No hints — refresh after operational + governance pass.</p>
      ) : null}
    </div>
  );
}

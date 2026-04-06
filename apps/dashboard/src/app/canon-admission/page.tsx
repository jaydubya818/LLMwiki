"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Crit = { id: string; label: string; verdict: string; note: string; tier?: string };
type Rec = {
  id: string;
  targetPage: string;
  context: string;
  criteria: Crit[];
  reviewerNote?: string;
  finalDecision?: string;
  readinessSummary?: string;
  linkedSnapshotId?: string;
};

export default function CanonAdmissionPage() {
  const [records, setRecords] = useState<Rec[]>([]);
  const [rationaleById, setRationaleById] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function load() {
    setLoadError(null);
    try {
      const r = await fetch("/api/canon-admission");
      let j: { records?: Rec[]; error?: string } = {};
      try {
        j = (await r.json()) as typeof j;
      } catch (e) {
        console.error("[canon-admission] load JSON:", e);
        setLoadError("Invalid response from server.");
        setRecords([]);
        return;
      }
      if (!r.ok) {
        setLoadError(typeof j.error === "string" ? j.error : `Load failed (HTTP ${r.status})`);
        setRecords([]);
        return;
      }
      setRecords(Array.isArray(j.records) ? j.records : []);
    } catch (e) {
      console.error("[canon-admission] load:", e);
      setLoadError(e instanceof Error ? e.message : "Network error");
      setRecords([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(id: string, reviewerNote: string, finalDecision: string) {
    setSaveError(null);
    const rationale = (rationaleById[id] ?? "").trim();
    try {
      const r = await fetch("/api/canon-admission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          reviewerNote,
          finalDecision: finalDecision || undefined,
          rationale: rationale || undefined,
        }),
      });
      let j: { error?: string } = {};
      try {
        j = (await r.json()) as typeof j;
      } catch (e) {
        console.error("[canon-admission] save JSON:", e);
        setSaveError(r.ok ? "Invalid response from server." : `HTTP ${r.status}`);
        return;
      }
      if (!r.ok) {
        setSaveError(typeof j.error === "string" ? j.error : `Save failed (HTTP ${r.status})`);
        return;
      }
      void load();
    } catch (e) {
      console.error("[canon-admission] save:", e);
      setSaveError(e instanceof Error ? e.message : "Network error");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Canon admission checklist</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Stricter gate before high-trust canon — <code className="text-[var(--accent)]">.brain/canon-admission.json</code>
        </p>
        <div className="mt-2 flex gap-3 text-xs text-sky-400">
          <Link href="/canon-council">Canon council</Link>
          <Link href="/canon-promotions">Promotions</Link>
        </div>
      </header>

      {loadError ? <p className="text-sm text-red-400">{loadError}</p> : null}
      {saveError ? <p className="text-sm text-amber-300">{saveError}</p> : null}

      <ul className="space-y-6">
        {records.map((rec) => (
          <li key={rec.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)]/50 p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <Link href={`/wiki?path=${encodeURIComponent(rec.targetPage)}`} className="font-mono text-sm text-sky-400">
                {rec.targetPage}
              </Link>
              <span className="text-xs text-[var(--muted)]">{rec.context}</span>
            </div>
            {rec.readinessSummary ? (
              <p className="mt-2 text-xs">
                <span className="text-[var(--muted)]">Readiness:</span>{" "}
                <span
                  className={
                    rec.readinessSummary === "blocked"
                      ? "text-red-300"
                      : rec.readinessSummary === "admit_with_warnings"
                        ? "text-amber-200"
                        : "text-emerald-300"
                  }
                >
                  {rec.readinessSummary.replace(/_/g, " ")}
                </span>
                {rec.linkedSnapshotId ? (
                  <span className="ml-2 font-mono text-[10px] text-[var(--muted)]">
                    snapshot {rec.linkedSnapshotId.slice(0, 8)}…
                  </span>
                ) : null}
              </p>
            ) : null}
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {rec.criteria.map((c) => (
                <li
                  key={c.id}
                  className={`rounded border px-2 py-2 text-xs ${
                    c.verdict === "fail"
                      ? "border-red-800/50 bg-red-950/20"
                      : c.verdict === "warn"
                        ? "border-amber-700/40 bg-amber-950/15"
                        : "border-emerald-900/40 bg-emerald-950/10"
                  }`}
                >
                  <div className="font-medium text-[var(--foreground)]">
                    {c.label}{" "}
                    {c.tier === "strong" ? (
                      <span className="text-[10px] font-normal text-rose-200/80">(gate)</span>
                    ) : c.tier ? (
                      <span className="text-[10px] font-normal text-zinc-500">(advisory)</span>
                    ) : null}
                  </div>
                  <div className="text-[var(--muted)]">{c.note}</div>
                  <div className="mt-1 uppercase text-[10px] text-[var(--muted)]">{c.verdict}</div>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-2 text-sm">
              <label className="block text-xs text-[var(--muted)]">
                Reviewer note
                <textarea
                  defaultValue={rec.reviewerNote ?? ""}
                  id={`note-${rec.id}`}
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-sm"
                  rows={2}
                />
              </label>
              <label className="block text-xs text-[var(--muted)]">
                Decision
                <select
                  id={`dec-${rec.id}`}
                  defaultValue={rec.finalDecision ?? ""}
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-sm"
                >
                  <option value="">—</option>
                  <option value="ready">ready</option>
                  <option value="not_ready">not_ready</option>
                  <option value="deferred">deferred</option>
                </select>
              </label>
              <label className="block text-xs text-[var(--muted)]">
                Override / admission rationale (when gates fail or settings require it)
                <input
                  value={rationaleById[rec.id] ?? ""}
                  onChange={(e) => setRationaleById((m) => ({ ...m, [rec.id]: e.target.value }))}
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-2 font-mono text-xs"
                  placeholder="Required for ready + blocked strong gates when governance-settings demands it"
                />
              </label>
              <button
                type="button"
                className="rounded bg-zinc-700 px-3 py-1 text-xs"
                onClick={() => {
                  const note = (document.getElementById(`note-${rec.id}`) as HTMLTextAreaElement).value;
                  const dec = (document.getElementById(`dec-${rec.id}`) as HTMLSelectElement).value;
                  void save(rec.id, note, dec);
                }}
              >
                Save
              </button>
            </div>
          </li>
        ))}
      </ul>

      {records.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No targets yet — add canon promotions or lock policy pages, then refresh.</p>
      ) : null}
    </div>
  );
}

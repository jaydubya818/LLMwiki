"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Item = {
  path: string;
  title: string;
  lockLabel: string;
  isCanonicalFm: boolean;
  pendingProposals: number;
  evidenceBucket?: string;
  qualityBucket?: string;
  unsupportedOpen: number;
  driftOpen: boolean;
  conflictOpen: boolean;
  humanBadge?: string;
  priorityScore: number;
  warnings: string[];
  urgency: string;
};

export default function CanonicalBoardPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [urgency, setUrgency] = useState<string>("all");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/canonical-board");
      if (!r.ok) {
        console.error("[canonical-board] load failed:", r.status);
        setItems([]);
        return;
      }
      const j = (await r.json()) as { items?: Item[] };
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch (e) {
      console.error("[canonical-board] load error:", e);
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered =
    urgency === "all" ? items : items.filter((i) => i.urgency === urgency);

  async function snapshot(pagePath: string) {
    try {
      const res = await fetch("/api/wiki-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pagePath, reason: "canonical-board" }),
      });
      let err = "";
      try {
        const j = (await res.json()) as { error?: string };
        if (!res.ok) err = j.error ?? `HTTP ${res.status}`;
      } catch {
        if (!res.ok) err = `HTTP ${res.status}`;
      }
      if (!res.ok) {
        console.error("[canonical-board] snapshot failed:", err);
        alert(`Snapshot failed: ${err}`);
        return;
      }
      alert("Snapshot recorded under outputs/reviews/snapshots/");
    } catch (e) {
      console.error("[canonical-board] snapshot:", e);
      alert(e instanceof Error ? e.message : "Snapshot failed");
    }
  }

  async function markReviewed(pagePath: string) {
    try {
      const res = await fetch("/api/human-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pagePath, by: "dashboard" }),
      });
      let err = "";
      try {
        const j = (await res.json()) as { error?: string };
        if (!res.ok) err = j.error ?? `HTTP ${res.status}`;
      } catch {
        if (!res.ok) err = `HTTP ${res.status}`;
      }
      if (!res.ok) {
        console.error("[canonical-board] human-review failed:", err);
        alert(`Could not mark reviewed: ${err}`);
        return;
      }
      await load();
    } catch (e) {
      console.error("[canonical-board] markReviewed:", e);
      alert(e instanceof Error ? e.message : "Request failed");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Canonical review board</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Locked, manual-review, and canonical pages — with triage signals. Run operational refresh to update.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          {(["all", "attention", "watch", "ok"] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUrgency(u)}
              className={`rounded-md border px-2 py-1 capitalize ${
                urgency === u ? "border-sky-500 text-sky-300" : "border-[var(--border)]"
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </header>
      <ul className="space-y-3">
        {filtered.map((it) => (
          <li
            key={it.path}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)]/50 p-4 text-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium text-[var(--foreground)]">{it.title}</div>
                <div className="font-mono text-xs text-[var(--accent)]">{it.path}</div>
              </div>
              <div className="flex flex-wrap gap-1 text-[10px] uppercase">
                {it.urgency === "attention" ? (
                  <span className="rounded bg-red-900/50 px-1.5 py-0.5 text-red-200">attention</span>
                ) : null}
                <span className="rounded bg-zinc-800 px-1.5 py-0.5">{it.lockLabel}</span>
                {it.isCanonicalFm ? (
                  <span className="rounded bg-amber-900/40 px-1.5 py-0.5 text-amber-200">canonical</span>
                ) : null}
                {it.pendingProposals > 0 ? (
                  <span className="rounded bg-violet-900/40 px-1.5 py-0.5 text-violet-200">
                    pending {it.pendingProposals}
                  </span>
                ) : null}
                {it.driftOpen ? (
                  <span className="rounded bg-orange-900/40 px-1.5 py-0.5">drift</span>
                ) : null}
                {it.conflictOpen ? (
                  <span className="rounded bg-rose-900/40 px-1.5 py-0.5">conflict</span>
                ) : null}
                {it.unsupportedOpen ? (
                  <span className="rounded bg-zinc-700 px-1.5 py-0.5">uns {it.unsupportedOpen}</span>
                ) : null}
                {it.evidenceBucket ? (
                  <span className="rounded bg-slate-800 px-1.5 py-0.5">evidence {it.evidenceBucket}</span>
                ) : null}
                {it.humanBadge ? (
                  <span className="rounded bg-emerald-900/30 px-1.5 py-0.5">{it.humanBadge}</span>
                ) : null}
                <span className="text-zinc-500">prio {it.priorityScore}</span>
              </div>
            </div>
            <ul className="mt-2 list-inside list-disc text-xs text-[var(--muted)]">
              {it.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Link href={`/wiki?path=${encodeURIComponent(it.path)}`} className="text-sky-400">
                Wiki
              </Link>
              <Link
                href={`/diff?file=${encodeURIComponent(it.path)}`}
                className="text-sky-400"
              >
                Diff
              </Link>
              <Link href={`/api/wiki-trace?path=${encodeURIComponent(it.path)}`} className="text-sky-400">
                Trace
              </Link>
              <button type="button" onClick={() => void snapshot(it.path)} className="text-sky-400">
                Snapshot
              </button>
              <button type="button" onClick={() => void markReviewed(it.path)} className="text-emerald-400">
                Mark human-reviewed
              </button>
              <Link href="/unsupported-claims" className="text-sky-400">
                Unsupported
              </Link>
              <Link href="/conflicts" className="text-sky-400">
                Conflicts
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

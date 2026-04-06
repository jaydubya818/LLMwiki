"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Decision = {
  id: string;
  title: string;
  status: string;
  wikiPath: string;
  date?: string;
  decision?: string;
};

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<Decision | null>(null);
  const [msg, setMsg] = useState("");
  const [msgIsError, setMsgIsError] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      const r = await fetch(`/api/decisions?${params}`);
      let j: { decisions?: Decision[]; error?: string } = {};
      try {
        j = (await r.json()) as typeof j;
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Could not parse list response.");
        setMsgIsError(true);
        return;
      }
      if (r.ok) {
        setDecisions(Array.isArray(j.decisions) ? j.decisions : []);
        setMsg("");
        setMsgIsError(false);
      } else {
        setMsg(j.error ?? "failed");
        setMsgIsError(true);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Network error");
      setMsgIsError(true);
    }
  }, [q, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refreshLedger() {
    setMsg("");
    setMsgIsError(false);
    try {
      const r = await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      let j: { count?: number; error?: string } = {};
      try {
        j = (await r.json()) as typeof j;
      } catch (e) {
        setMsg(`Error refreshing ledger: ${e instanceof Error ? e.message : "invalid response"}`);
        setMsgIsError(true);
        return;
      }
      if (r.ok) {
        setMsg(`Indexed ${j.count ?? 0} decisions`);
        setMsgIsError(false);
      } else {
        setMsg(j.error ?? "Error refreshing ledger");
        setMsgIsError(true);
        void load();
      }
    } catch (e) {
      setMsg(`Error refreshing ledger: ${e instanceof Error ? e.message : "network error"}`);
      setMsgIsError(true);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Decision ledger</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Machine-readable: <code className="text-[var(--accent)]">.brain/decision-ledger.json</code> · human index:{" "}
            <code className="text-[var(--accent)]">wiki/decisions/INDEX.md</code>. Refresh after adding ADR-style pages.
            Draft stubs with <code className="text-[var(--accent)]">include_in_ledger: false</code> stay on disk but out of
            the ledger until you promote — use{" "}
            <Link href="/decision-draft" className="text-sky-400">
              Decision draft
            </Link>
            . <Link href="/decision-sunset" className="text-sky-400">Sunset hints</Link> flag older decisions worth revisiting.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white"
          onClick={() => void refreshLedger()}
        >
          Refresh index
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title or path"
          className="min-w-[200px] flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="draft">draft</option>
          <option value="proposed">proposed</option>
          <option value="accepted">accepted</option>
          <option value="reversed">reversed</option>
          <option value="superseded">superseded</option>
        </select>
      </div>

      {msg ? (
        <p className={msgIsError ? "text-sm text-rose-400" : "text-sm text-emerald-300"}>{msg}</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <ul className="space-y-2 text-sm">
          {decisions.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)]/60 px-3 py-2 text-left hover:border-sky-500/40"
                onClick={() => setDetail(d)}
              >
                <span className="font-medium">{d.title}</span>
                <span className="ml-2 text-xs text-[var(--muted)]">{d.status}</span>
                <div className="font-mono text-xs text-[var(--accent)]">{d.wikiPath}</div>
              </button>
            </li>
          ))}
        </ul>
        <aside className="rounded-lg border border-[var(--border)] bg-black/20 p-4 text-sm">
          {detail ? (
            <div className="space-y-2">
              <div className="text-xs uppercase text-[var(--muted)]">Detail</div>
              <div className="font-semibold">{detail.title}</div>
              <div className="text-xs text-[var(--muted)]">{detail.wikiPath}</div>
              {detail.date ? <div className="text-xs">Date: {detail.date}</div> : null}
              {detail.decision ? (
                <p className="text-xs text-[var(--muted)]">{detail.decision.slice(0, 600)}</p>
              ) : null}
              <a
                href={`/wiki?path=${encodeURIComponent(detail.wikiPath)}`}
                className="inline-block text-sky-400 text-xs"
              >
                Open in wiki viewer →
              </a>
            </div>
          ) : (
            <p className="text-xs text-[var(--muted)]">Select a decision to preview.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

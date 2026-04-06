"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  kind: string;
  path: string;
  title: string;
  canonicalState: string;
  warnings: string[];
  trustSummary: string;
  pendingActions: string[];
  recommendedNext: string;
  priorityScore: number;
  quickLinks: { label: string; href: string }[];
};

type FileShape = { headline?: string; items?: Item[] };

export default function CanonCouncilPage() {
  const [data, setData] = useState<FileShape | null>(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<"priority" | "path">("priority");
  const [councilNote, setCouncilNote] = useState("");
  const [councilMsg, setCouncilMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/canon-council");
    const j = await r.json();
    setData(j);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function snapshotPage(path: string) {
    setCouncilMsg("");
    const r = await fetch("/api/canon-council", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "page-snapshot", pagePath: path, reason: "canon-council" }),
    });
    const j = await r.json();
    setCouncilMsg(r.ok ? `Snapshot saved · ${j.id ?? ""}` : j.error ?? "error");
  }

  async function markReviewed(it: Item, result: string) {
    setCouncilMsg("");
    const r = await fetch("/api/canon-council", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "mark-reviewed",
        path: it.path,
        id: it.id,
        kind: it.kind,
        result,
        rationale: councilNote.trim() || undefined,
      }),
    });
    const j = await r.json();
    setCouncilMsg(
      r.ok
        ? `Logged · override ${j.overrideId ?? "—"}${j.minutesPath ? ` · ${j.minutesPath}` : ""}`
        : j.error ?? "error"
    );
  }

  const items = useMemo(() => {
    let rows = [...(data?.items ?? [])];
    const q = filter.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (i) =>
          i.path.toLowerCase().includes(q) ||
          i.title.toLowerCase().includes(q) ||
          i.kind.toLowerCase().includes(q)
      );
    }
    rows.sort((a, b) => (sort === "priority" ? b.priorityScore - a.priorityScore : a.path.localeCompare(b.path)));
    return rows;
  }, [data?.items, filter, sort]);

  if (!data?.items && !data?.headline) {
    return <p className="text-[var(--muted)]">Loading canon council…</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Canon council</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">{data.headline}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Executive slice for trusted knowledge — see <code className="text-[var(--accent)]">.brain/canon-council.json</code>
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href="/governance" className="text-xs text-sky-400">
            ← Governance
          </Link>
          <Link href="/canonical-board" className="text-xs text-sky-400">
            Canonical board
          </Link>
          <Link href="/review-session" className="text-xs text-sky-400">
            Review session
          </Link>
          <Link href="/canon-admission" className="text-xs text-sky-400">
            Canon admission
          </Link>
        </div>
      </header>

      {councilMsg ? <p className="text-sm text-sky-300/90">{councilMsg}</p> : null}

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]/40 px-3 py-2 text-xs text-[var(--muted)]">
        <label className="block">
          Optional rationale for mark-reviewed / council minutes
          <input
            value={councilNote}
            onChange={(e) => setCouncilNote(e.target.value)}
            className="mt-1 w-full max-w-xl rounded border border-[var(--border)] bg-[var(--card)] px-2 py-2 font-mono text-xs"
            placeholder="Short note — flows into human overrides when you mark an item"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Filter path / title / kind…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm w-64"
        />
        <label className="text-xs text-[var(--muted)] flex items-center gap-2">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "priority" | "path")}
            className="rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
          >
            <option value="priority">Priority ↓</option>
            <option value="path">Path A→Z</option>
          </select>
        </label>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No rows match — refresh operational intelligence or lower filter.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((i) => (
            <li key={i.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-xs uppercase text-[var(--muted)]">
                    {i.kind} · score {i.priorityScore}
                  </div>
                  <h2 className="text-lg font-medium text-[var(--foreground)]">{i.title}</h2>
                  <p className="mt-1 font-mono text-xs text-[var(--accent)]">{i.path}</p>
                  <p className="mt-1 text-xs text-amber-200/80">{i.canonicalState}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {i.quickLinks.map((l) => (
                    <Link
                      key={l.label}
                      href={l.href}
                      className="rounded border border-[var(--border)] px-2 py-1 text-xs text-sky-400"
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              </div>
              {i.warnings.length ? (
                <ul className="mt-2 list-inside list-disc text-xs text-[var(--muted)]">
                  {i.warnings.slice(0, 5).map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-2 text-sm text-[var(--foreground)]/90">{i.trustSummary}</p>
              {i.pendingActions.length ? (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  <span className="text-[var(--foreground)]">Pending:</span> {i.pendingActions.join(" · ")}
                </p>
              ) : null}
              <p className="mt-2 text-sm text-sky-300/90">
                <strong>Next:</strong> {i.recommendedNext}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-200"
                  onClick={() => void snapshotPage(i.path)}
                >
                  Snapshot page
                </button>
                <button
                  type="button"
                  className="rounded bg-emerald-900/50 px-2 py-1 text-xs"
                  onClick={() => void markReviewed(i, "reviewed")}
                >
                  Mark reviewed
                </button>
                <button
                  type="button"
                  className="rounded bg-zinc-700 px-2 py-1 text-xs"
                  onClick={() => void markReviewed(i, "deferred")}
                >
                  Deferred
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

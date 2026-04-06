"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type WsRow = { name: string; type: string; path: string; abs: string };

type WorkspacePayload =
  | { mode: "single"; brainName: string; root: string; error?: string }
  | {
      mode: "workspace";
      workspaceRoot: string;
      activeBrain: string | null;
      brains: WsRow[];
      recentRuns: Array<{
        brain: string;
        kind: string;
        summary: string;
        ok: boolean;
        startedAt: string;
      }>;
      promotionAlerts: { brain: string; count: number }[];
      error?: string;
    };

export default function WorkspacePage() {
  const [data, setData] = useState<WorkspacePayload | null>(null);
  const [syncMd, setSyncMd] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/workspace");
    setData(await r.json());
  }, []);

  async function runSyncSummary() {
    setSyncBusy(true);
    setSyncMd(null);
    try {
      const r = await fetch("/api/sync-summary", { method: "POST" });
      const j = await r.json();
      if (!r.ok) {
        setSyncMd(`Error: ${j.error ?? r.statusText}`);
      } else {
        setSyncMd(j.markdown ?? "");
      }
    } finally {
      setSyncBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return <div className="text-[var(--muted)]">Loading workspace…</div>;
  }
  if ("error" in data && data.error) {
    return (
      <div className="max-w-xl rounded-lg border border-red-500/40 bg-red-950/30 p-4 text-sm">
        {data.error}
      </div>
    );
  }

  if (data.mode === "single") {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Workspace</h1>
        <p className="text-sm text-[var(--muted)]">
          Running in single-brain mode. Set{" "}
          <code className="text-[var(--accent)]">SECOND_BRAIN_WORKSPACE</code> to the repo
          root and use <code className="text-[var(--accent)]">brain workspace init</code> for
          multi-brain.
        </p>
        <p className="font-mono text-xs text-[var(--accent)]">
          {data.brainName} — {data.root}
        </p>
        <Link href="/" className="text-sm text-sky-400 hover:underline">
          ← Command center
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Workspace</h1>
        <p className="text-sm text-[var(--muted)]">
          Active brain:{" "}
          <span className="font-mono text-[var(--accent)]">{data.activeBrain ?? "—"}</span>
        </p>
        <p className="font-mono text-xs text-[var(--muted)]">{data.workspaceRoot}</p>
      </header>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Brains
        </h2>
        <ul className="mt-4 space-y-2 text-sm">
          {data.brains.map((b) => (
            <li
              key={b.name}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)]/80 px-3 py-2"
            >
              <span className="font-medium">{b.name}</span>
              <span className="text-xs text-[var(--muted)]">{b.type}</span>
              <span className="font-mono text-xs text-[var(--muted)]">{b.path}</span>
            </li>
          ))}
        </ul>
      </section>

      {data.promotionAlerts.length > 0 ? (
        <section className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-200/90">
            Promotion candidates
          </h2>
          <ul className="mt-3 space-y-1 text-sm">
            {data.promotionAlerts.map((p) => (
              <li key={p.brain}>
                <Link href={`/promotions?brain=${encodeURIComponent(p.brain)}`} className="text-sky-400 hover:underline">
                  {p.brain}: {p.count} candidate{p.count === 1 ? "" : "s"}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Recent runs (all brains)
        </h2>
        <ul className="mt-4 space-y-2 text-sm">
          {data.recentRuns.map((r, i) => (
            <li
              key={`${r.brain}-${r.startedAt}-${i}`}
              className="flex flex-wrap gap-3 border-b border-[var(--border)]/60 pb-2"
            >
              <span className="font-mono text-xs text-[var(--accent)]">{r.brain}</span>
              <span className="text-[var(--muted)]">{r.kind}</span>
              <span className="flex-1 truncate">{r.summary}</span>
              <span className={r.ok ? "text-emerald-400" : "text-amber-400"}>
                {r.ok ? "ok" : "warn"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/promotions"
          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--accent)]"
        >
          Promotion center
        </Link>
        <button
          type="button"
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          onClick={() => void load()}
        >
          Refresh
        </button>
        <button
          type="button"
          disabled={syncBusy}
          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--accent)] disabled:opacity-50"
          onClick={() => void runSyncSummary()}
        >
          {syncBusy ? "Generating summary…" : "Cross-brain summary (LLM)"}
        </button>
      </div>

      {syncMd ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)]/40 p-5">
          <h2 className="text-sm font-semibold text-[var(--muted)]">Last sync summary</h2>
          <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap text-xs text-[var(--foreground)]">
            {syncMd}
          </pre>
        </section>
      ) : null}
    </div>
  );
}

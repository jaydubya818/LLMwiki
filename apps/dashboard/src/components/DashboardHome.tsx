"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Status = {
  root?: string;
  brainName?: string;
  workspaceRoot?: string | null;
  gitRoot?: string;
  state?: { lastIngestAt?: string; pendingWikiChanges?: string[] };
  runs?: { kind: string; summary: string; ok: boolean; startedAt?: string }[];
  searchDocs?: number;
  graphMeta?: { nodeCount?: number; orphans?: number };
  logTail?: string;
  error?: string;
};

export function DashboardHome() {
  const [s, setS] = useState<Status | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/status");
    setS(await r.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function action(name: string, extra?: Record<string, unknown>) {
    setMsg("");
    const r = await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: name, ...extra }),
    });
    const j = await r.json();
    setMsg(JSON.stringify(j, null, 2));
    void load();
  }

  if (s?.error) {
    return (
      <div className="max-w-xl rounded-lg border border-red-500/40 bg-red-950/30 p-4 text-sm">
        {s.error}
      </div>
    );
  }

  if (!s) {
    return <div className="text-[var(--muted)]">Loading brain status…</div>;
  }

  const pending = s.state?.pendingWikiChanges?.length ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Command center</h1>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          Trust is git-backed; synthesis is AI-maintained. Use Search and Diff before
          you approve commits.
        </p>
        <p className="font-mono text-xs text-[var(--accent)]">
          {s.brainName ? `${s.brainName} · ` : ""}
          {s.root}
        </p>
        {s.workspaceRoot ? (
          <p className="text-xs text-[var(--muted)]">
            Workspace: <span className="font-mono">{s.workspaceRoot}</span>
          </p>
        ) : null}
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="Last ingest" value={s.state?.lastIngestAt ?? "—"} />
        <Metric
          label="Search index docs"
          value={String(s.searchDocs ?? 0)}
        />
        <Metric
          label="Graph / orphans"
          value={`${s.graphMeta?.nodeCount ?? 0} nodes · ${s.graphMeta?.orphans ?? 0} orphans`}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Quick actions
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionBtn onClick={() => action("ingest")}>Ingest</ActionBtn>
            <ActionBtn onClick={() => action("ingest", { force: true })}>
              Ingest (force)
            </ActionBtn>
            <ActionBtn onClick={() => action("compile")}>Compile</ActionBtn>
            <ActionBtn onClick={() => action("lint")}>Lint</ActionBtn>
            <Link
              href="/search"
              className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)]"
            >
              Ask / search
            </Link>
            <Link
              href="/diff"
              className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)]"
            >
              Diff review ({pending})
            </Link>
            <Link
              href="/workspace"
              className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)]"
            >
              Workspace
            </Link>
            <Link
              href="/promotions"
              className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)]"
            >
              Promotions
            </Link>
          </div>
          {msg ? (
            <pre className="mt-4 max-h-48 overflow-auto rounded-md bg-black/40 p-3 text-xs text-emerald-200">
              {msg}
            </pre>
          ) : null}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Recent runs
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            {(s.runs ?? []).map((r, i) => (
              <li key={i} className="flex justify-between gap-4 border-b border-[var(--border)]/60 pb-2">
                <span className="text-[var(--muted)]">{r.kind}</span>
                <span className="flex-1 truncate text-right">{r.summary}</span>
                <span className={r.ok ? "text-emerald-400" : "text-amber-400"}>
                  {r.ok ? "ok" : "warn"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Log tail
        </h2>
        <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap font-mono text-xs text-[var(--muted)]">
          {s.logTail ?? "—"}
        </pre>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/80 p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-lg font-medium">{value}</div>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md bg-sky-600/90 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
    >
      {children}
    </button>
  );
}

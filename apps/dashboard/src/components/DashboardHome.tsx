"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

// ─── Types (kept from original, no changes) ─────────────────────────────────

type RecentFile = { path: string; mtimeMs: number };

type Operational = {
  pendingWikiCount: number;
  pendingPaths: string[];
  reviewPendingCount: number;
  reviewStateVersion: string;
  staleIngest: boolean;
  staleLint: boolean;
  ingestAgeDays: number | null;
  lintAgeDays: number | null;
  reviewAgeDays: number | null;
  trustLevel: "clean" | "attention";
  lastIngestSummary?: string;
  lastLintSummary?: string;
  lastReviewSummary?: string;
  nextActions: string[];
  recentWiki: RecentFile[];
  recentOutputs: RecentFile[];
  suggestedCommitMessage: string;
};

type LastDoctorCache = {
  generatedAt: string;
  verdict: "ready" | "warnings" | "blocked";
  readinessLabel: string;
  summary: string;
  vaultName: string;
  vaultNameSource: string;
  failCount: number;
  warnCount: number;
  passCount: number;
  nextActions: string[];
};

type DoctorLastPayload = {
  cache: LastDoctorCache | null;
  meta: {
    neverRun: boolean;
    staleByAge: boolean;
    hints: string[];
    pendingWikiCountNow: number;
    error?: string;
  };
};

type Status = {
  root?: string;
  brainName?: string;
  vaultName?: string;
  workspaceRoot?: string | null;
  state?: {
    lastIngestAt?: string;
    lastLintAt?: string;
    lastReviewAt?: string;
    pendingWikiChanges?: string[];
  };
  runs?: { kind: string; summary: string; ok: boolean; startedAt?: string }[];
  searchDocs?: number;
  graphMeta?: { nodeCount?: number; orphans?: number };
  operational?: Operational;
  doctorLast?: DoctorLastPayload | null;
  error?: string;
};

// ─── Component ───────────────────────────────────────────────────────────────

export function DashboardHome() {
  const [s, setS] = useState<Status | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const [stRes, lastRes] = await Promise.all([
        fetch("/api/status"),
        fetch("/api/doctor-last"),
      ]);
      let doctorLast: DoctorLastPayload | null = null;
      if (lastRes.ok) {
        try { doctorLast = (await lastRes.json()) as DoctorLastPayload; } catch { doctorLast = null; }
      }
      if (!stRes.ok) {
        setS({ error: "Could not load status.", doctorLast });
        return;
      }
      const st = (await stRes.json()) as Status;
      setS({ ...st, doctorLast });
    } catch (e) {
      setS({ error: e instanceof Error ? e.message : "Failed to load.", doctorLast: null });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function syncNow() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const r = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ingest" }),
      });
      const j = await r.json() as { summary?: string; ok?: boolean };
      setSyncResult(j.summary ?? (j.ok ? "Sync complete." : "Sync finished — check runs for details."));
    } catch {
      setSyncResult("Could not run sync. Is the server running?");
    } finally {
      setSyncing(false);
      void load();
    }
  }

  // Loading state
  if (!s) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-sm text-[var(--muted)]">Loading…</div>
      </div>
    );
  }

  const op = s.operational;
  const pending = op?.pendingWikiCount ?? s.state?.pendingWikiChanges?.length ?? 0;
  const recentNotes = (op?.recentWiki ?? []).slice(0, 6);
  const recentRuns  = (s.runs ?? []).slice(0, 4);
  const noteCount   = s.searchDocs ?? 0;
  const neverRun    = s.doctorLast?.meta.neverRun ?? true;

  // Format "X minutes ago" / "X hours ago" from ISO string
  function ago(iso?: string) {
    if (!iso) return null;
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 2)  return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const lastSync   = ago(s.state?.lastIngestAt ?? undefined);
  const doctorVerdict = s.doctorLast?.cache?.verdict;

  return (
    <div className="mx-auto max-w-3xl space-y-8">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
          {s.brainName && s.brainName !== "default" ? s.brainName : "My Knowledge Base"}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {noteCount > 0 ? <><span className="font-medium text-[var(--foreground)]">{noteCount}</span> notes indexed</> : "No notes indexed yet"}{" "}
          {lastSync ? <>· synced <span className="font-medium text-[var(--foreground)]">{lastSync}</span></> : "· never synced"}
          {s.root ? <> · <span className="font-mono text-xs">{s.root}</span></> : null}
        </p>
      </header>

      {/* ── First-time setup banner ─────────────────────────────────────── */}
      {neverRun && (
        <div className="rounded-xl border border-blue-300 bg-blue-50 px-5 py-4">
          <p className="text-sm font-medium text-blue-800">👋 Getting started</p>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-[var(--muted)]">
            <li>Drop files into <code className="rounded bg-blue-100 px-1 text-xs text-blue-700">raw/</code> — notes, PDFs, anything.</li>
            <li>Click <strong className="text-[var(--foreground)]">Sync Wiki</strong> below to process them.</li>
            <li>Browse, search, and ask questions about your notes.</li>
          </ol>
        </div>
      )}

      {/* ── 3-step action cards ─────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Card 1: Add files */}
        <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="text-2xl">📁</div>
          <h2 className="mt-2 text-base font-semibold text-[var(--foreground)]">Add Files</h2>
          <p className="mt-1 flex-1 text-sm text-[var(--muted)]">
            Drop notes, PDFs, or links into your <code className="rounded bg-[var(--border)] px-1 text-xs">raw/</code> folder.
          </p>
          <div className="mt-4">
            <code className="block rounded-lg bg-[var(--border)] px-3 py-2 font-mono text-xs text-[var(--accent)]">
              {s.root ?? "~/My LLM Wiki"}/raw/
            </code>
          </div>
        </div>

        {/* Card 2: Sync wiki */}
        <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="text-2xl">🔄</div>
          <h2 className="mt-2 text-base font-semibold text-[var(--foreground)]">Sync Wiki</h2>
          <p className="mt-1 flex-1 text-sm text-[var(--muted)]">
            Turn your raw files into organised, searchable wiki notes.
          </p>
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={syncing ? undefined : syncNow}
              disabled={syncing}
              className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-60"
            >
              {syncing ? "Syncing…" : "Sync Now"}
            </button>
            {pending > 0 && !syncing && (
              <Link
                href="/diff"
                className="block rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800 hover:border-amber-500"
              >
                {pending} change{pending !== 1 ? "s" : ""} to review →
              </Link>
            )}
            {syncResult && (
              <p className="text-xs text-emerald-700">{syncResult}</p>
            )}
          </div>
        </div>

        {/* Card 3: Ask questions */}
        <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="text-2xl">🔍</div>
          <h2 className="mt-2 text-base font-semibold text-[var(--foreground)]">Ask Anything</h2>
          <p className="mt-1 flex-1 text-sm text-[var(--muted)]">
            Search or ask questions across all your notes.
          </p>
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (search.trim()) {
                window.location.href = `/search?q=${encodeURIComponent(search.trim())}`;
              }
            }}
          >
            <input
              type="text"
              placeholder="What connects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <Link
              href="/search"
              className="mt-2 block rounded-lg border border-[var(--border)] px-4 py-2 text-center text-sm text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)]"
            >
              Open search →
            </Link>
          </form>
        </div>
      </div>

      {/* ── Alerts (only show when there's actually something to do) ───── */}
      {doctorVerdict === "blocked" && (
        <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm">
          <span className="text-lg">🔴</span>
          <div>
            <p className="font-medium text-red-800">Health check found issues that need fixing</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">{s.doctorLast?.cache?.summary}</p>
            <Link href="/doctor" className="mt-2 inline-block text-xs text-blue-600 hover:underline">
              View details →
            </Link>
          </div>
        </div>
      )}
      {doctorVerdict === "warnings" && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-400 bg-amber-50 px-4 py-3 text-sm">
          <span className="text-lg">🟡</span>
          <div>
            <p className="font-medium text-amber-800">Health check found a few warnings</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">{s.doctorLast?.cache?.summary}</p>
            <Link href="/doctor" className="mt-2 inline-block text-xs text-blue-600 hover:underline">
              View details →
            </Link>
          </div>
        </div>
      )}

      {/* ── Stats row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Notes" value={String(noteCount)} />
        <Stat
          label="Last synced"
          value={lastSync ?? "never"}
          stale={!!op?.staleIngest}
        />
        <Stat
          label="Health check"
          value={
            neverRun ? "never run"
              : doctorVerdict === "ready" ? "✓ ready"
              : doctorVerdict === "warnings" ? "⚠ warnings"
              : doctorVerdict === "blocked" ? "✗ blocked"
              : "—"
          }
          stale={doctorVerdict === "blocked"}
        />
        <Stat
          label="Graph nodes"
          value={s.graphMeta?.nodeCount ? String(s.graphMeta.nodeCount) : "—"}
        />
      </div>

      {/* ── Recent Notes ───────────────────────────────────────────────── */}
      {recentNotes.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Recent Notes</h2>
            <Link href="/wiki" className="text-xs text-blue-600 hover:underline">
              Browse all →
            </Link>
          </div>
          <div className="divide-y divide-[var(--border)]/50 rounded-xl border border-[var(--border)] bg-[var(--card)]">
            {recentNotes.map((f) => {
              const name = f.path.replace(/^wiki\//, "").replace(/\.md$/, "");
              return (
                <Link
                  key={f.path}
                  href={`/wiki?path=${encodeURIComponent(f.path)}`}
                  className="flex items-center gap-3 px-4 py-3 text-sm transition hover:bg-[var(--ring)]/20"
                >
                  <span className="text-base">📄</span>
                  <span className="flex-1 text-[var(--foreground)]">{name}</span>
                  <span className="font-mono text-xs text-[var(--muted)]">
                    {ago(new Date(f.mtimeMs).toISOString())}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Recent Activity ────────────────────────────────────────────── */}
      {recentRuns.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Recent Activity</h2>
            <Link href="/runs" className="text-xs text-blue-600 hover:underline">
              View all →
            </Link>
          </div>
          <div className="divide-y divide-[var(--border)]/50 rounded-xl border border-[var(--border)] bg-[var(--card)]">
            {recentRuns.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className={`h-2 w-2 rounded-full ${r.ok ? "bg-emerald-400" : "bg-amber-400"}`} />
                <span className="flex-1 truncate text-[var(--muted)]">{r.summary || r.kind}</span>
                <span className="font-mono text-xs text-[var(--muted)]">
                  {r.startedAt ? ago(r.startedAt) : r.kind}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Empty state (no notes, no runs) ────────────────────────────── */}
      {recentNotes.length === 0 && recentRuns.length === 0 && !neverRun && (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-10 text-center">
          <p className="text-[var(--muted)]">Nothing here yet — add files to <code className="text-xs text-blue-600">raw/</code> and click Sync.</p>
        </div>
      )}

    </div>
  );
}

// ─── Small helpers ───────────────────────────────────────────────────────────

function Stat({ label, value, stale }: { label: string; value: string; stale?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        stale
          ? "border-amber-400 bg-amber-50"
          : "border-[var(--border)] bg-[var(--card)]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-sm font-medium text-[var(--foreground)]">{value}</div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Entry = {
  order: number;
  refType: string;
  refId: string;
  title: string;
  detail: string;
  path?: string;
  nextAction: string;
};

type Session = {
  cursor: number;
  queue: Entry[];
};

function msgIsError(text: string) {
  return /fail|error|invalid|required|missing|not found|denied/i.test(text);
}

export default function ReviewSessionPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [msg, setMsg] = useState("");
  const [sessionNote, setSessionNote] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch("/api/governance");
      const j = (await r.json().catch(() => ({}))) as {
        reviewSession?: Session | null;
        error?: string;
      };
      if (!r.ok) {
        setLoadError(typeof j.error === "string" ? j.error : `Load failed (${r.status})`);
        setSession(null);
        return;
      }
      const s = j.reviewSession;
      if (s && Array.isArray(s.queue) && typeof s.cursor === "number") {
        const cursor = Math.max(0, Math.min(s.queue.length > 0 ? s.queue.length - 1 : 0, s.cursor));
        setSession({ ...s, cursor: s.queue.length === 0 ? 0 : cursor });
      } else {
        setSession(s ?? null);
      }
    } catch (e) {
      console.error(e);
      setLoadError("Could not load review session.");
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cur =
    session && session.queue.length > 0
      ? session.queue[Math.min(Math.max(0, session.cursor), session.queue.length - 1)]!
      : null;

  async function rebuild() {
    setMsg("");
    setBusy(true);
    try {
      const r = await fetch("/api/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review-session-rebuild" }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        session?: { queue?: unknown[] };
      };
      setMsg(
        r.ok
          ? `Rebuilt — ${Array.isArray(j.session?.queue) ? j.session.queue.length : 0} items`
          : (typeof j.error === "string" ? j.error : `Rebuild failed (${r.status})`)
      );
    } catch (e) {
      console.error(e);
      setMsg("Could not rebuild queue.");
    } finally {
      setBusy(false);
      void load();
    }
  }

  async function step(delta: number) {
    setMsg("");
    setBusy(true);
    try {
      const r = await fetch("/api/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review-session-cursor", delta }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; session?: Session };
      if (!r.ok) {
        setMsg(typeof j.error === "string" ? j.error : `Step failed (${r.status})`);
        return;
      }
      if (j.session && Array.isArray(j.session.queue)) {
        const s = j.session;
        const cursor = Math.max(0, Math.min(s.queue.length > 0 ? s.queue.length - 1 : 0, s.cursor));
        setSession({ ...s, cursor: s.queue.length === 0 ? 0 : cursor });
      }
    } catch (e) {
      console.error(e);
      setMsg("Could not move cursor.");
    } finally {
      setBusy(false);
    }
  }

  async function markCurrentReviewed() {
    if (!cur) return;
    setMsg("");
    setBusy(true);
    try {
      const r = await fetch("/api/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review-session-mark-item",
          path: cur.path,
          refType: cur.refType,
          refId: cur.refId,
          rationale: sessionNote.trim() || undefined,
          actionLabel: "review_session_reviewed",
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        capture?: { overrideId?: string; minutesPath?: string };
      };
      setMsg(
        r.ok
          ? `Logged · ${j.capture?.overrideId ?? ""}${j.capture?.minutesPath ? ` · ${j.capture.minutesPath}` : ""}`
          : (typeof j.error === "string" ? j.error : `Log failed (${r.status})`)
      );
      if (r.ok) setSessionNote("");
    } catch (e) {
      console.error(e);
      setMsg("Could not log review.");
    } finally {
      setBusy(false);
      void load();
    }
  }

  async function saveSummary() {
    setMsg("");
    setBusy(true);
    try {
      const q = session?.queue ?? [];
      const cursor = session ? Math.min(Math.max(0, session.cursor), Math.max(0, q.length - 1)) : 0;
      const ids = q.slice(0, Math.max(cursor + 1, 1)).map((e) => e.refId);
      const r = await fetch("/api/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review-session-summary", reviewedIds: ids }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; path?: string };
      setMsg(
        typeof j.path === "string"
          ? `Summary: ${j.path}`
          : r.ok
            ? "Summary response missing path."
            : (typeof j.error === "string" ? j.error : `Save failed (${r.status})`)
      );
    } catch (e) {
      console.error(e);
      setMsg("Could not write summary.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Review session mode</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          One item at a time from overdue SLA rows, canon promotions, and the canon drift watchlist. Queue:{" "}
          <code className="text-[var(--accent)]">.brain/review-session-state.json</code>
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-sky-400">
          <Link href="/governance">← Governance hub</Link>
          <Link href="/canon-council">Canon council</Link>
          <Link href="/executive">Executive · debt &amp; plans</Link>
        </div>
      </header>

      {loadError ? <p className="text-sm text-red-400">{loadError}</p> : null}
      {loading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded bg-sky-800 px-3 py-1 text-sm disabled:opacity-50"
          onClick={() => void rebuild()}
        >
          Rebuild queue
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded bg-zinc-700 px-3 py-1 text-sm disabled:opacity-50"
          onClick={() => void step(-1)}
        >
          Previous
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded bg-zinc-700 px-3 py-1 text-sm disabled:opacity-50"
          onClick={() => void step(1)}
        >
          Next
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded bg-emerald-900/60 px-3 py-1 text-sm disabled:opacity-50"
          onClick={() => void saveSummary()}
        >
          Write session summary md
        </button>
        <button
          type="button"
          disabled={busy || !cur}
          className="rounded bg-slate-700 px-3 py-1 text-sm disabled:opacity-50"
          onClick={() => void markCurrentReviewed()}
        >
          Mark current · log intent
        </button>
      </div>
      {msg ? (
        <p className={`text-sm ${msgIsError(msg) ? "text-red-400" : "text-emerald-300"}`}>{msg}</p>
      ) : null}

      {session && session.queue.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Queue empty — run refresh (lint or governance) and Rebuild.</p>
      ) : null}

      {cur ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/80 p-6 space-y-3">
          <label className="block text-xs text-[var(--muted)]" htmlFor="review-session-note">
            Optional note (human override + high-trust prompts)
          </label>
          <input
            id="review-session-note"
            value={sessionNote}
            onChange={(e) => setSessionNote(e.target.value)}
            className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-sm"
            placeholder="Short rationale for this item"
          />
          <div className="text-xs text-[var(--muted)]">
            {session && session.queue.length > 0 ? Math.min(session.cursor + 1, session.queue.length) : 0} /{" "}
            {session?.queue.length ?? 0}
          </div>
          <h2 className="text-lg font-medium text-[var(--foreground)]">{cur.title}</h2>
          <p className="text-sm text-[var(--muted)]">{cur.detail}</p>
          <p className="text-sm text-sky-300/90">
            <strong>Next:</strong> {cur.nextAction}
          </p>
          {cur.path ? (
            <a
              href={`/wiki?path=${encodeURIComponent(cur.path)}`}
              className="inline-block text-sm text-sky-400 underline"
            >
              Open {cur.path}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

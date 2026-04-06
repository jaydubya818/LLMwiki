"use client";

import { useState } from "react";

export default function ComparePage() {
  const [paths, setPaths] = useState("wiki/topics/a.md\nwiki/topics/b.md");
  const [inbox, setInbox] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    setErr("");
    setMsg("");
    const lines = paths
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2 || lines.length > 4) {
      setErr("Enter 2–4 repo-relative wiki paths, one per line.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/compare-wiki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: lines, inbox }),
      });
      let j: { error?: string; outputRelPath?: string; lineageId?: string } = {};
      try {
        j = (await r.json()) as typeof j;
      } catch {
        setErr(r.ok ? "Could not parse response." : `HTTP ${r.status}`);
        return;
      }
      if (!r.ok) {
        setErr(j.error ?? "failed");
        return;
      }
      setMsg(`Wrote ${j.outputRelPath ?? "output"} · lineage ${j.lineageId ?? "—"}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Comparative synthesis</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Compare 2–4 wiki pages. Output lands in{" "}
          <code className="text-[var(--accent)]">outputs/comparisons/</code> with promotion metadata. Optional: queue to
          the local promotion inbox.
        </p>
      </header>

      <label htmlFor="wiki-paths" className="block text-xs uppercase text-[var(--muted)]">
        Wiki paths (one per line)
      </label>
      <textarea
        id="wiki-paths"
        value={paths}
        onChange={(e) => setPaths(e.target.value)}
        rows={6}
        className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-mono text-xs"
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={inbox} onChange={(e) => setInbox(e.target.checked)} />
        Add result to promotion inbox
      </label>
      <button
        type="button"
        disabled={loading}
        onClick={() => void run()}
        className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Working…" : "Generate comparison"}
      </button>
      {err ? <p className="text-sm text-red-400">{err}</p> : null}
      {msg ? <p className="text-sm text-emerald-300">{msg}</p> : null}
    </div>
  );
}

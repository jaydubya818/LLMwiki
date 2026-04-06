"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export default function QoQDiffPage() {
  const [files, setFiles] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/qoq-diff");
    const j = await r.json();
    setFiles(j.quarterlyReviews ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setMsg("");
    const r = await fetch("/api/qoq-diff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to }),
    });
    const j = await r.json();
    setMsg(r.ok ? `Wrote ${j.path}` : j.error);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Quarter-over-quarter memory diff</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Compare two <code className="text-[var(--accent)]">outputs/reviews/quarterly-review-*.md</code> files. Output:
          <code className="text-[var(--accent)]"> outputs/reviews/quarter-diff-*.md</code>
        </p>
        <Link href="/governance" className="mt-2 inline-block text-xs text-sky-400">
          ← Governance
        </Link>
      </header>

      <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)]/50 p-4">
        <label className="block text-xs text-[var(--muted)]">
          From (older)
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-sm"
          >
            <option value="">—</option>
            {files.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-[var(--muted)]">
          To (newer)
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-sm"
          >
            <option value="">—</option>
            {files.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded-lg bg-sky-700 px-4 py-2 text-sm"
          disabled={!from || !to || from === to}
          onClick={() => void generate()}
        >
          Generate diff
        </button>
        {msg ? <p className="text-sm text-emerald-300">{msg}</p> : null}
      </div>

      <p className="text-xs text-[var(--muted)]">
        CLI: <code className="text-[var(--accent)]">brain qoq-diff --from ... --to ...</code>
      </p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type RunRow = {
  id?: string;
  kind: string;
  summary: string;
  ok: boolean;
  startedAt?: string;
  errors?: string[];
  changedFiles?: string[];
  trustNotes?: string[];
};

export default function RunsPage() {
  const [runs, setRuns] = useState<RunRow[]>([]);

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/runs");
      const j = await r.json();
      setRuns(j.runs ?? []);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Run history</h1>
      <p className="text-sm text-[var(--muted)]">
        Open a run for full JSON replay (changed files, inputs, lineage, trust notes).{" "}
        <Link href="/trust" className="text-sky-400">
          Trust overview
        </Link>
      </p>
      <ul className="space-y-2 text-sm">
        {runs.map((r, idx) => (
          <li
            key={r.id ?? `${r.kind}-${r.startedAt ?? "na"}-${idx}`}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)]/60 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-[var(--accent)]">{r.kind}</span>
              <span className={r.ok ? "text-emerald-400" : "text-amber-400"}>
                {r.ok ? "ok" : "issues"}
              </span>
            </div>
            {r.id ? (
              <Link
                href={`/replay?id=${encodeURIComponent(r.id)}`}
                className="mt-1 inline-block font-mono text-xs text-sky-400 hover:underline"
              >
                Replay · {r.id.slice(0, 8)}…
              </Link>
            ) : null}
            {r.startedAt ? (
              <div className="text-xs text-[var(--muted)]">{r.startedAt}</div>
            ) : null}
            <p className="mt-2 text-[var(--muted)]">{r.summary}</p>
            {r.changedFiles?.length ? (
              <div className="mt-2 text-xs text-[var(--muted)]">
                Changed: {r.changedFiles.slice(0, 6).join(", ")}
                {r.changedFiles.length > 6 ? "…" : ""}
              </div>
            ) : null}
            {r.trustNotes?.length ? (
              <ul className="mt-2 list-disc pl-4 text-xs text-amber-200/90">
                {r.trustNotes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            ) : null}
            {r.errors?.length ? (
              <pre className="mt-2 max-h-32 overflow-auto text-xs text-red-300">
                {r.errors.join("\n")}
              </pre>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

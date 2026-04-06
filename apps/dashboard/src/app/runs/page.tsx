"use client";

import { useEffect, useState } from "react";

export default function RunsPage() {
  const [runs, setRuns] = useState<
    { kind: string; summary: string; ok: boolean; errors?: string[] }[]
  >([]);

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
      <ul className="space-y-2 text-sm">
        {runs.map((r, i) => (
          <li
            key={i}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)]/60 p-4"
          >
            <div className="flex justify-between gap-2">
              <span className="font-medium text-[var(--accent)]">{r.kind}</span>
              <span className={r.ok ? "text-emerald-400" : "text-amber-400"}>
                {r.ok ? "ok" : "issues"}
              </span>
            </div>
            <p className="mt-2 text-[var(--muted)]">{r.summary}</p>
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

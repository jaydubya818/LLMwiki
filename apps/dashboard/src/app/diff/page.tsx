"use client";

import { useEffect, useState } from "react";

export default function DiffPage() {
  const [patch, setPatch] = useState("");
  const [files, setFiles] = useState<{ path: string; workingDir: string }[]>([]);

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/diff");
      const j = await r.json();
      setPatch(j.patch ?? "");
      setFiles(j.files ?? []);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">Diff review</h1>
      <p className="text-sm text-[var(--muted)]">
        Approve or reject per file below; then run{" "}
        <code className="text-[var(--accent)]">brain approve</code> from the CLI (or{" "}
        <code className="text-[var(--accent)]">brain approve --all</code>).
      </p>
      <ul className="space-y-2 text-sm">
        {files.map((f) => (
          <li
            key={f.path}
            className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2"
          >
            <span className="font-mono text-xs">{f.path}</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded bg-emerald-700 px-2 py-1 text-xs"
                onClick={() =>
                  void fetch("/api/review", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path: f.path, decision: "approved" }),
                  })
                }
              >
                Approve
              </button>
              <button
                type="button"
                className="rounded bg-red-900 px-2 py-1 text-xs"
                onClick={() =>
                  void fetch("/api/review", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path: f.path, decision: "rejected" }),
                  })
                }
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
      <pre className="max-h-[560px] overflow-auto rounded-lg bg-black/50 p-4 text-xs text-[var(--foreground)]">
        {patch || "(no diff)"}
      </pre>
    </div>
  );
}

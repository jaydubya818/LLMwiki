"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Row = {
  relPath: string;
  kind: string;
  confidence?: string;
  rationale?: string;
  source: string;
};

function PromotionsInner() {
  const sp = useSearchParams();
  const initialBrain = sp.get("brain") ?? "";
  const [brain, setBrain] = useState(initialBrain);
  const [rows, setRows] = useState<Row[]>([]);
  const [targetBrain, setTargetBrain] = useState("master");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const b = sp.get("brain");
    if (b) setBrain(b);
  }, [sp]);

  const load = useCallback(async () => {
    setErr("");
    setMsg("");
    if (!brain.trim()) {
      setRows([]);
      return;
    }
    const r = await fetch(`/api/promotions?brain=${encodeURIComponent(brain)}`);
    const j = await r.json();
    if (!r.ok) {
      setErr(j.error ?? "failed");
      return;
    }
    setRows(j.rows ?? []);
  }, [brain]);

  useEffect(() => {
    void load();
  }, [load]);

  async function promote(relPath: string) {
    setErr("");
    setMsg("");
    const r = await fetch("/api/promotions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceBrain: brain,
        targetBrain,
        relPath,
        rationale: "Promoted from dashboard promotion center",
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      setErr(j.error ?? "promote failed");
      return;
    }
    setMsg(`Promoted → ${j.destAbs}`);
    void load();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Promotion center</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Review curated candidates from an agent brain and promote into the master brain with
          provenance. Nothing reaches master automatically.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <input
          value={brain}
          onChange={(e) => setBrain(e.target.value)}
          placeholder="Source agent brain name"
          className="min-w-[200px] flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
        />
        <input
          value={targetBrain}
          onChange={(e) => setTargetBrain(e.target.value)}
          placeholder="Target brain (usually master)"
          className="min-w-[200px] flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white"
        >
          Load candidates
        </button>
      </div>

      {err ? <p className="text-sm text-red-400">{err}</p> : null}
      {msg ? (
        <pre className="max-h-32 overflow-auto rounded-md bg-black/40 p-3 text-xs text-emerald-200">
          {msg}
        </pre>
      ) : null}

      <ul className="space-y-3">
        {rows.map((r) => (
          <li
            key={r.relPath}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)]/70 p-4 text-sm"
          >
            <div className="font-mono text-xs text-[var(--accent)]">{r.relPath}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">
              {r.kind} · {r.source}
              {r.confidence ? ` · confidence ${r.confidence}` : ""}
            </div>
            {r.rationale ? (
              <p className="mt-2 text-[var(--muted)]">{r.rationale}</p>
            ) : null}
            <button
              type="button"
              className="mt-3 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
              onClick={() => void promote(r.relPath)}
            >
              Promote to {targetBrain || "master"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PromotionsPage() {
  return (
    <Suspense
      fallback={<div className="text-[var(--muted)]">Loading promotion center…</div>}
    >
      <PromotionsInner />
    </Suspense>
  );
}

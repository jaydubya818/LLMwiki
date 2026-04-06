"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function ReplayBody() {
  const sp = useSearchParams();
  const id = sp.get("id") ?? "";
  const [run, setRun] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!id) {
      setRun(null);
      setErr("");
      return;
    }
    const ac = new AbortController();
    setErr("");
    setRun(null);
    void (async () => {
      try {
        const r = await fetch(`/api/replay?id=${encodeURIComponent(id)}`, { signal: ac.signal });
        const j = (await r.json().catch(() => ({}))) as { error?: string; run?: unknown };
        if (ac.signal.aborted) return;
        if (!r.ok) {
          setErr(typeof j.error === "string" ? j.error : `Failed (${r.status})`);
          setRun(null);
          return;
        }
        setErr("");
        if (j.run && typeof j.run === "object" && !Array.isArray(j.run)) {
          setRun(j.run as Record<string, unknown>);
        } else {
          setRun(null);
          setErr("Run payload missing or invalid.");
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error(e);
        setErr("Could not load run.");
      }
    })();
    return () => ac.abort();
  }, [id]);

  if (!id) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Pass <code className="text-[var(--accent)]">?id=&lt;run-uuid&gt;</code> from the Runs page, or use{" "}
        <code className="text-[var(--accent)]">brain run &lt;id&gt;</code>.
      </p>
    );
  }
  if (err) return <p className="text-red-400">{err}</p>;
  if (!run) return <p className="text-[var(--muted)]">Loading…</p>;

  return (
    <div className="space-y-4">
      <pre className="max-h-[70vh] overflow-auto rounded-lg border border-[var(--border)] bg-black/40 p-4 text-xs text-[var(--muted)]">
        {JSON.stringify(run, null, 2)}
      </pre>
      <Link href="/runs" className="text-sm text-sky-400">
        ← Back to runs
      </Link>
    </div>
  );
}

export default function ReplayPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Run replay</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Inspect what changed, which inputs were considered, linked outputs, lineage ids, and trust notes for a single
          operation record.
        </p>
      </header>
      <Suspense fallback={<p className="text-[var(--muted)]">Loading…</p>}>
        <ReplayBody />
      </Suspense>
    </div>
  );
}

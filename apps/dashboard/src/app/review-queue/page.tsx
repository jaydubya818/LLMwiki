"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Row = { path: string; bucket: string; priority0to100: number; why: string[] };

type SlaHint = { daysOpen: number; bucket: string };

export default function ReviewQueuePage() {
  const [queue, setQueue] = useState<Row[]>([]);
  const [slaByPath, setSlaByPath] = useState<Record<string, SlaHint>>({});

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/review-priority");
        if (!r.ok) {
          console.error("[review-queue] review-priority failed:", r.status);
          setQueue([]);
          return;
        }
        const j = (await r.json()) as { queue?: Row[] };
        setQueue(Array.isArray(j.queue) ? j.queue : []);
      } catch (e) {
        console.error("[review-queue] review-priority:", e);
        setQueue([]);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/governance");
        if (!r.ok) {
          console.error("[review-queue] governance failed:", r.status);
          return;
        }
        const j = (await r.json()) as { reviewSla?: { items?: { path?: string; daysOpen: number; bucket: string }[] } };
        const m: Record<string, SlaHint> = {};
        for (const it of j.reviewSla?.items ?? []) {
          if (!it.path) continue;
          const prev = m[it.path];
          if (!prev || it.daysOpen > prev.daysOpen) m[it.path] = { daysOpen: it.daysOpen, bucket: it.bucket };
        }
        setSlaByPath(m);
      } catch (e) {
        console.error("[review-queue] governance:", e);
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Review priority queue</h1>
      <p className="text-sm text-[var(--muted)]">
        Merges page quality, unsupported claims, drift, conflicts, hubs, and canonical locks into a single triage order.
        <Link href="/review-session" className="ml-2 text-sky-400">
          Review session mode →
        </Link>
      </p>
      <ol className="space-y-4 text-sm">
        {queue.map((r, i) => (
          <li key={r.path} className="rounded-lg border border-[var(--border)] bg-[var(--card)]/40 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs text-zinc-500">#{i + 1}</span>
              <span
                className={
                  r.bucket === "urgent"
                    ? "text-red-400"
                    : r.bucket === "soon"
                      ? "text-amber-300"
                      : "text-zinc-400"
                }
              >
                {r.bucket} · {r.priority0to100}
              </span>
            </div>
            <div className="mt-1 font-mono text-xs text-[var(--accent)]">{r.path}</div>
            {slaByPath[r.path] ? (
              <p className="mt-1 text-xs text-amber-200/90">
                Review aging: <strong>{slaByPath[r.path]!.bucket}</strong> — ~{slaByPath[r.path]!.daysOpen}d open
                (heuristic)
              </p>
            ) : null}
            <ul className="mt-2 list-inside list-disc text-xs text-[var(--muted)]">
              {r.why.map((w, j) => (
                <li key={j}>{w}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              <Link href={`/wiki?path=${encodeURIComponent(r.path)}`} className="text-sky-400">
                Wiki
              </Link>
              <Link
                href={`/diff?file=${encodeURIComponent(r.path)}`}
                className="text-sky-400"
              >
                Diff
              </Link>
              <Link href={`/api/wiki-trace?path=${encodeURIComponent(r.path)}`} className="text-sky-400">
                Trace JSON
              </Link>
              <Link href={`/api/page-quality?path=${encodeURIComponent(r.path)}`} className="text-sky-400">
                Quality JSON
              </Link>
              <Link href="/compare" className="text-sky-400">
                Compare pages
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

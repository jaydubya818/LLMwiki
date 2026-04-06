"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Entry = {
  decisionId: string;
  title: string;
  wikiPath: string;
  status: string;
  relatedWikiPages: string[];
  conflicts: { id: string; topic: string }[];
  drift: { id: string; summary: string }[];
  unsupported: { id: string; excerpt: string }[];
  openLoops: { id: string; title: string }[];
  canonPromotions: { id: string; summary: string }[];
  affectedDomains: string[];
};

export default function DecisionImpactPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/governance");
      if (!r.ok) {
        setError(`Could not load (HTTP ${r.status}).`);
        setEntries([]);
        return;
      }
      const j = (await r.json()) as { decisionImpact?: { entries?: Entry[] } };
      setEntries(Array.isArray(j.decisionImpact?.entries) ? j.decisionImpact!.entries! : []);
    } catch (e) {
      console.error("[decision-impact] load:", e);
      setError(e instanceof Error ? e.message : "Network error");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Decision impact map</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Downstream wiki links and open trust items per decision ledger entry. Inspectable JSON:{" "}
          <code className="text-[var(--accent)]">.brain/decision-impact.json</code>
        </p>
        <Link href="/decisions" className="mt-2 mr-4 inline-block text-xs text-sky-400">
          Decision ledger →
        </Link>
        <Link href="/governance" className="mt-2 inline-block text-xs text-sky-400">
          Governance hub
        </Link>
      </header>

      {loading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {!loading && !error && entries.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No ledger entries — refresh decision index first from Decisions page.</p>
      ) : null}

      <ul className="space-y-6">
        {entries.map((e) => (
          <li key={e.decisionId} className="rounded-lg border border-[var(--border)] bg-[var(--card)]/70 p-4 text-sm">
            <h2 className="text-base font-medium text-[var(--foreground)]">{e.title}</h2>
            <p className="mt-1 font-mono text-xs text-[var(--accent)]">{e.wikiPath}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {e.status} · domains: {e.affectedDomains.join(", ") || "—"}
            </p>
            {e.relatedWikiPages.length ? (
              <div className="mt-3">
                <div className="text-xs uppercase text-[var(--muted)]">Related pages</div>
                <ul className="mt-1 font-mono text-xs text-sky-400/90">
                  {e.relatedWikiPages.slice(0, 12).map((p) => (
                    <li key={p}>
                      <a href={`/wiki?path=${encodeURIComponent(p)}`}>{p}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {(e.conflicts.length || e.drift.length || e.unsupported.length || e.openLoops.length) ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs text-[var(--muted)]">
                {e.conflicts.length ? (
                  <div>
                    <strong className="text-[var(--foreground)]">Conflicts</strong>
                    <ul className="list-inside list-disc">
                      {e.conflicts.map((c) => (
                        <li key={c.id}>{c.topic}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {e.drift.length ? (
                  <div>
                    <strong className="text-[var(--foreground)]">Drift</strong>
                    <ul className="list-inside list-disc">
                      {e.drift.map((d) => (
                        <li key={d.id}>{d.summary}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {e.unsupported.length ? (
                  <div>
                    <strong className="text-[var(--foreground)]">Unsupported</strong>
                    <ul className="list-inside list-disc">
                      {e.unsupported.map((u) => (
                        <li key={u.id}>{u.excerpt}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {e.openLoops.length ? (
                  <div>
                    <strong className="text-[var(--foreground)]">Open loops</strong>
                    <ul className="list-inside list-disc">
                      {e.openLoops.map((o) => (
                        <li key={o.id}>{o.title}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-xs text-[var(--muted)]">No open trust queues reference this cluster.</p>
            )}
            {e.canonPromotions.length ? (
              <p className="mt-2 text-xs text-amber-200/80">
                Canon promotions: {e.canonPromotions.map((p) => p.id).join(", ")}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

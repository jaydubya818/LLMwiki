"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Theme = {
  id: string;
  title: string;
  description: string;
  status: string;
  signalStrength: number;
  recurrenceNotes: string[];
  relatedPages: string[];
  relatedDecisions: string[];
  relatedDomains: string[];
};

export default function StrategicThemesPage() {
  const [themes, setThemes] = useState<Theme[]>([]);

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/strategic-themes");
      const j = await r.json();
      setThemes(j.themes ?? []);
    })();
  }, []);

  const grouped = {
    active: themes.filter((t) => t.status === "active"),
    emerging: themes.filter((t) => t.status === "emerging"),
    fading: themes.filter((t) => t.status === "fading" || t.status === "retired"),
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Strategic themes</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Heuristic recurrence across loops, decisions, and review queue —{" "}
          <code className="text-[var(--accent)]">.brain/strategic-themes.json</code> · optional{" "}
          <code className="text-[var(--accent)]">wiki/work/strategic-themes.md</code>
        </p>
        <div className="mt-2 flex gap-3 text-xs text-sky-400">
          <Link href="/governance">← Governance</Link>
          <Link href="/executive">Executive</Link>
        </div>
      </header>

      {(["active", "emerging", "fading"] as const).map((bucket) => (
        <section key={bucket}>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">{bucket}</h2>
          <ul className="mt-3 space-y-3">
            {grouped[bucket].length === 0 ? (
              <li className="text-sm text-[var(--muted)]">—</li>
            ) : (
              grouped[bucket].map((t) => (
                <li key={t.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)]/50 p-4">
                  <div className="flex justify-between gap-2">
                    <h3 className="font-medium text-[var(--foreground)]">{t.title}</h3>
                    <span className="text-xs text-[var(--muted)]">strength {t.signalStrength}/10</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">{t.description}</p>
                  <p className="mt-2 text-xs text-sky-200/80">{t.recurrenceNotes[0]}</p>
                  {t.relatedDomains.length ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">Domains: {t.relatedDomains.join(", ")}</p>
                  ) : null}
                  {t.relatedPages.slice(0, 6).map((p) => (
                    <Link
                      key={p}
                      href={`/wiki?path=${encodeURIComponent(p)}`}
                      className="mr-2 mt-1 inline-block font-mono text-xs text-sky-400"
                    >
                      {p}
                    </Link>
                  ))}
                  {t.relatedDecisions.slice(0, 4).map((p) => (
                    <Link
                      key={p}
                      href={`/wiki?path=${encodeURIComponent(p)}`}
                      className="mr-2 mt-1 inline-block font-mono text-xs text-amber-200/80"
                    >
                      {p}
                    </Link>
                  ))}
                </li>
              ))
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

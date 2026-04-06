"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

const tiles = [
  { href: "/executive", label: "Executive mode", body: "High-signal slice: decisions, drift, conflicts, review queue, cross-signal dragons, review debt, time-boxed plans." },
  { href: "/canon-council", label: "Canon council", body: "Executive panel: pending promotions, canon warnings, watchlist-on-canon, evidence alerts." },
  { href: "/canonical-board", label: "Canonical review board", body: "Locked / manual-review / canonical pages + pending proposals + warnings." },
  { href: "/review-queue", label: "Review priority", body: "What to read first if you only have a few minutes." },
  { href: "/cross-signal", label: "Cross-signal correlation", body: "Pages where multiple trust signals stack — “real dragons”." },
  { href: "/resolutions", label: "Resolution memory", body: "Durable notes when conflicts, drift, or claims are resolved." },
  { href: "/decision-draft", label: "Decision draft from source", body: "Preview then confirm a wiki/decisions/ stub from raw or outputs; stubs skip ledger until promoted." },
  { href: "/steward", label: "Domain steward mode", body: "Focus one domain: queue, loops, drift, board, dragons." },
  { href: "/unsupported-claims", label: "Unsupported claims", body: "Trust triage for weak provenance — conservative flags." },
  { href: "/conflicts", label: "Conflict resolver", body: "Structured tensions (e.g. status mismatch across linked pages)." },
  { href: "/drift", label: "Knowledge drift", body: "Likely lag between raw activity and wiki reconciliation." },
  { href: "/open-loops", label: "Open loops", body: "Questions, TODOs, follow-ups scraped from wiki + outputs." },
  { href: "/source-trace", label: "Source → wiki trace", body: "Pick a raw file; see downstream wiki, outputs, decisions; supersession JSON." },
  { href: "/heatmap", label: "Synthesis heatmap", body: "Domain matrix: raw vs wiki maturity + risk signals." },
  { href: "/relationships", label: "Relationship hub", body: "People / projects indexes and auto graph-backed hub page." },
  { href: "/strategic-themes", label: "Strategic themes", body: "Recurring loops / domain signals — heuristic themes JSON + optional wiki mirror." },
  { href: "/decision-sunset", label: "Decision sunset", body: "Aging or stressed decisions that may need human revalidation." },
  { href: "/qoq-diff", label: "Quarter vs quarter", body: "Structured diff between two quarterly review markdown files." },
];

export default function OperationsPage() {
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setMsg("");
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/operational/refresh", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        wikiPagesScanned?: number;
        errors?: string[];
      };
      if (!r.ok) {
        setErr(typeof j.error === "string" ? j.error : `Refresh failed (${r.status})`);
        return;
      }
      const scanned = typeof j.wikiPagesScanned === "number" ? j.wikiPagesScanned : "—";
      const tail =
        Array.isArray(j.errors) && j.errors.length > 0 ? j.errors.join("; ") : "no errors";
      setMsg(`Refreshed · ${scanned} wiki pages · ${tail}`);
    } catch (e) {
      console.error(e);
      setErr("Could not refresh operational intelligence.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Operations &amp; intelligence</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Local heuristics only — refresh after ingest or bulk edits. State lives under{" "}
          <code className="text-[var(--accent)]">.brain/*.json</code>. Interpret as triage hints, not ground truth.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Refreshing…" : "Refresh operational intelligence"}
          </button>
          <Link href="/trust" className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">
            Trust v1 hub
          </Link>
          <button
            type="button"
            disabled={busy}
            className="rounded-md border border-emerald-800/50 px-4 py-2 text-sm text-emerald-200 disabled:opacity-50"
            onClick={async () => {
              setErr("");
              setBusy(true);
              try {
                const r = await fetch("/api/review-packet", { method: "POST" });
                const j = (await r.json().catch(() => ({}))) as { path?: string; error?: string };
                if (!r.ok) {
                  setErr(typeof j.error === "string" ? j.error : `Review packet failed (${r.status})`);
                  return;
                }
                if (typeof j.path === "string") setMsg(`Review packet: ${j.path}`);
                else setErr("Review packet response missing path.");
              } catch (e) {
                console.error(e);
                setErr("Could not generate review packet.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Generate review packet
          </button>
        </div>
        {err ? <p className="text-sm text-red-400">{err}</p> : null}
        {msg ? <p className="text-sm text-emerald-300">{msg}</p> : null}
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {tiles.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              className="block rounded-lg border border-[var(--border)] bg-[var(--card)]/60 p-4 text-sm transition hover:border-sky-500/40"
            >
              <div className="font-medium text-sky-400">{t.label}</div>
              <p className="mt-2 text-[var(--muted)]">{t.body}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

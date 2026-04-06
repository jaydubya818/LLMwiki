"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

export default function GovernanceHubPage() {
  const [msg, setMsg] = useState("");
  const [msgIsError, setMsgIsError] = useState(false);

  const refresh = useCallback(async () => {
    setMsg("Refreshing…");
    setMsgIsError(false);
    try {
      const r = await fetch("/api/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      let j: { wikiPagesScanned?: number; error?: string } = {};
      try {
        j = (await r.json()) as typeof j;
      } catch {
        setMsg(r.ok ? "Invalid response." : `HTTP ${r.status}`);
        setMsgIsError(true);
        return;
      }
      if (r.ok) {
        setMsg(`OK — wiki pages scanned: ${j.wikiPagesScanned ?? "—"}`);
        setMsgIsError(false);
      } else {
        setMsg(j.error ?? `Request failed (HTTP ${r.status})`);
        setMsgIsError(true);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Network error");
      setMsgIsError(true);
    }
  }, []);

  async function postDigest(body: Record<string, unknown>, okLabel: (j: Record<string, unknown>) => string) {
    setMsg("");
    setMsgIsError(false);
    try {
      const r = await fetch("/api/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let j: Record<string, unknown> = {};
      try {
        j = (await r.json()) as Record<string, unknown>;
      } catch {
        setMsg(r.ok ? "Invalid response." : `HTTP ${r.status}`);
        setMsgIsError(true);
        return;
      }
      if (!r.ok) {
        setMsg(typeof j.error === "string" ? j.error : `HTTP ${r.status}`);
        setMsgIsError(true);
        return;
      }
      setMsg(okLabel(j));
      setMsgIsError(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Network error");
      setMsgIsError(true);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Governance &amp; review</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Local JSON under <code className="text-[var(--accent)]">.brain/</code>, markdown digests under{" "}
          <code className="text-[var(--accent)]">outputs/reviews/</code>. Signals are{" "}
          <strong>advisory</strong> — meant to steer attention, not ticket load.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg bg-sky-700 px-3 py-2 text-sm"
          onClick={() => void refresh()}
        >
          Refresh trust + governance
        </button>
        <span
          className={`self-center text-xs ${msgIsError ? "text-rose-400" : "text-[var(--muted)]"}`}
        >
          {msg}
        </span>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {[
          { href: "/canon-promotions", t: "Canon promotion workflow" },
          { href: "/review-session", t: "Review session mode" },
          { href: "/canon-watchlist", t: "Canon drift watchlist" },
          { href: "/decision-impact", t: "Decision impact map" },
          { href: "/review-queue", t: "Review priority queue (SLA hints inline)" },
          { href: "/executive", t: "Executive mode" },
          { href: "/canon-council", t: "Canon council (executive)" },
          { href: "/canon-admission", t: "Canon admission checklist" },
          { href: "/decision-sunset", t: "Decision sunset hints" },
          { href: "/strategic-themes", t: "Strategic themes" },
          { href: "/qoq-diff", t: "Quarter-over-quarter diff" },
          { href: "/human-overrides", t: "Human override journal" },
          { href: "/diff", t: "Diff & proposed wiki updates" },
        ].map((x) => (
          <li key={x.href}>
            <Link
              href={x.href}
              className="block rounded-lg border border-[var(--border)] bg-[var(--card)]/70 px-4 py-3 text-sky-400 hover:border-sky-500/40"
            >
              {x.t}
            </Link>
          </li>
        ))}
      </ul>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)]/50 p-4 text-sm">
        <h2 className="font-medium text-[var(--foreground)]">Generate digests</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded bg-zinc-700 px-2 py-1 text-xs"
            onClick={() =>
              void postDigest({ action: "steward-digest", domain: "work" }, (j) =>
                typeof j.path === "string" ? `Steward digest: ${j.path}` : "Steward digest completed."
              )
            }
          >
            Steward digest (work)
          </button>
          <button
            type="button"
            className="rounded bg-zinc-700 px-2 py-1 text-xs"
            onClick={() =>
              void postDigest({ action: "steward-digest", all: true }, (j) => {
                const paths = j.paths;
                return Array.isArray(paths)
                  ? `Wrote ${paths.length} file(s)`
                  : "Steward digest (all) completed.";
              })
            }
          >
            Steward digest (all domains)
          </button>
          <button
            type="button"
            className="rounded bg-zinc-700 px-2 py-1 text-xs"
            onClick={() =>
              void postDigest({ action: "quarterly-review" }, (j) =>
                typeof j.path === "string" ? `Quarterly: ${j.path}` : "Quarterly review generated."
              )
            }
          >
            Quarterly operational review
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          SLA hints live in <code className="text-[var(--accent)]">.brain/review-sla.json</code>; evidence
          alerts in <code className="text-[var(--accent)]">.brain/evidence-change-alerts.json</code>.
        </p>
      </section>
    </div>
  );
}

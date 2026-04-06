"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Promo = {
  id: string;
  sourceArtifactPath: string;
  sourceType: string;
  proposedTargetCanonicalPage: string;
  promotionSummary: string;
  rationale: string;
  status: string;
  linkedProposalPath?: string;
};

type MsgKind = "success" | "error" | "warn";

export default function CanonPromotionsPage() {
  const [items, setItems] = useState<Promo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; kind: MsgKind } | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [target, setTarget] = useState("");
  const [summary, setSummary] = useState("");
  const [source, setSource] = useState("");
  const [rationale, setRationale] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await fetch("/api/governance");
      if (!r.ok) {
        setLoadError(`Could not load (HTTP ${r.status}).`);
        setItems([]);
        return;
      }
      const j = (await r.json()) as { canonPromotions?: { items?: Promo[] } };
      setItems(Array.isArray(j.canonPromotions?.items) ? j.canonPromotions!.items! : []);
    } catch (e) {
      console.error("[canon-promotions] load:", e);
      setLoadError(e instanceof Error ? e.message : "Network error");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addManual() {
    setMsg(null);
    const src = source.trim();
    const tgt = target.trim();
    if (!src || !tgt) {
      setMsg({ text: "Source path and target wiki are required.", kind: "error" });
      return;
    }
    try {
      const r = await fetch("/api/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "canon-promotion-add",
          sourceArtifactPath: src,
          sourceType: "wiki_section",
          proposedTargetCanonicalPage: tgt,
          rationale: rationale.trim() || "Manual request",
          promotionSummary: summary.trim() || "Canon promotion",
        }),
      });
      let j: { rec?: { id?: string }; error?: string } = {};
      try {
        j = (await r.json()) as typeof j;
      } catch {
        setMsg({
          text: r.ok ? "Invalid response from server." : `HTTP ${r.status}`,
          kind: "error",
        });
        return;
      }
      if (!r.ok) {
        setMsg({ text: j.error ?? `Request failed (HTTP ${r.status})`, kind: "error" });
        return;
      }
      setMsg({ text: `Added ${j.rec?.id ?? "item"}`, kind: "success" });
      setSource("");
      setTarget("");
      setSummary("");
      setRationale("");
      void load();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Network error", kind: "error" });
    }
  }

  async function patch(id: string, status: string) {
    setMsg(null);
    try {
      const r = await fetch("/api/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "canon-promotion-update",
          id,
          status,
          rationale: decisionNote.trim() || undefined,
        }),
      });
      let j: { capture?: { overrideId?: string }; needsRationale?: boolean; error?: string } = {};
      try {
        j = (await r.json()) as typeof j;
      } catch {
        setMsg({ text: r.ok ? "Invalid response." : `HTTP ${r.status}`, kind: "error" });
        void load();
        return;
      }
      if (r.ok) {
        setMsg({
          text: `Updated ${status}${j.capture?.overrideId ? ` · logged ${j.capture.overrideId}` : ""}`,
          kind: "success",
        });
        setDecisionNote("");
      } else {
        setMsg({
          text: j.needsRationale
            ? "Rationale required (try governance settings / decision note)"
            : (j.error ?? "Update failed"),
          kind: "error",
        });
      }
      void load();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Network error", kind: "error" });
      void load();
    }
  }

  async function materialize(id: string) {
    setMsg(null);
    try {
      const r = await fetch("/api/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "canon-promotion-materialize", id }),
      });
      let j: { code?: string; error?: string; proposedRel?: string; snapshotCreated?: boolean } = {};
      try {
        j = (await r.json()) as typeof j;
      } catch {
        setMsg({ text: r.ok ? "Invalid response." : `HTTP ${r.status}`, kind: "error" });
        void load();
        return;
      }
      if (r.status === 409 && j.code === "SNAPSHOT_REQUIRED") {
        setMsg({ text: `Snapshot needed: ${j.error ?? "required"}`, kind: "warn" });
      } else if (r.ok) {
        setMsg({
          text: `Proposed: ${j.proposedRel ?? "—"}${j.snapshotCreated ? " · snapshot created" : ""}`,
          kind: "success",
        });
      } else {
        setMsg({ text: j.error ?? `Failed (HTTP ${r.status})`, kind: "error" });
      }
      void load();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Network error", kind: "error" });
      void load();
    }
  }

  const msgClass =
    msg?.kind === "error"
      ? "text-rose-400"
      : msg?.kind === "warn"
        ? "text-amber-300"
        : "text-emerald-300";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Canon promotion workflow</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Editorial path into locked knowledge: proposals land in{" "}
          <code className="text-[var(--accent)]">.brain/proposed-wiki-updates/</code> — never silent overwrite.
          State: <code className="text-[var(--accent)]">.brain/canon-promotions.json</code>.
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          <Link href="/governance" className="text-sky-400">
            ← Governance hub
          </Link>{" "}
          ·{" "}
          <Link href="/promotion-inbox" className="text-sky-400">
            Promotion inbox
          </Link>
        </p>
      </header>

      {loadError ? <p className="text-sm text-rose-400">{loadError}</p> : null}

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)]/50 p-4 text-sm space-y-2">
        <h2 className="font-medium">New request</h2>
        <label htmlFor="canon-promo-source" className="sr-only">
          Source path
        </label>
        <input
          id="canon-promo-source"
          aria-label="Source path"
          className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-2 font-mono text-xs"
          placeholder="Source path (e.g. outputs/reports/foo.md)"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <label htmlFor="canon-promo-target" className="sr-only">
          Target wiki
        </label>
        <input
          id="canon-promo-target"
          aria-label="Target wiki"
          className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-2 font-mono text-xs"
          placeholder="Target wiki (e.g. wiki/decisions/bar.md)"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <label htmlFor="canon-promo-summary" className="sr-only">
          One-line summary
        </label>
        <input
          id="canon-promo-summary"
          aria-label="One-line summary"
          className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-xs"
          placeholder="One-line summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
        <label htmlFor="canon-promo-rationale" className="sr-only">
          Rationale
        </label>
        <input
          id="canon-promo-rationale"
          aria-label="Rationale"
          className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-xs"
          placeholder="Rationale"
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
        />
        <button type="button" className="rounded bg-sky-800 px-3 py-1 text-xs" onClick={() => void addManual()}>
          Queue promotion
        </button>
      </section>

      {msg ? <p className={`text-sm ${msgClass}`}>{msg.text}</p> : null}

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)]/40 p-3 text-xs text-[var(--muted)] space-y-2">
        <label className="block">
          Optional note for next approve / reject / defer (flows into override journal + optional rationale gate)
          <input
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-2 font-mono text-xs"
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            placeholder="Short human intent — required for some high-trust paths when settings demand it"
          />
        </label>
      </section>

      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)]/70 p-4 text-sm">
            <div className="font-mono text-xs text-[var(--accent)]">{it.sourceArtifactPath}</div>
            <div className="text-xs text-[var(--muted)]">
              → {it.proposedTargetCanonicalPage} · {it.status} · {it.sourceType}
            </div>
            <p className="mt-2 text-[var(--muted)]">{it.promotionSummary}</p>
            {it.linkedProposalPath ? (
              <p className="mt-1 text-xs text-amber-300">Proposal: {it.linkedProposalPath}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="rounded bg-zinc-600 px-2 py-1 text-xs" onClick={() => void patch(it.id, "reviewing")}>
                Reviewing
              </button>
              <button type="button" className="rounded bg-emerald-900/70 px-2 py-1 text-xs" onClick={() => void patch(it.id, "approved")}>
                Approve intent
              </button>
              <button
                type="button"
                className="rounded bg-sky-800 px-2 py-1 text-xs font-medium"
                onClick={() => void materialize(it.id)}
              >
                Materialize → proposal file
              </button>
              <button type="button" className="rounded bg-zinc-700 px-2 py-1 text-xs" onClick={() => void patch(it.id, "deferred")}>
                Defer
              </button>
              <button type="button" className="rounded bg-red-900/50 px-2 py-1 text-xs" onClick={() => void patch(it.id, "rejected")}>
                Reject
              </button>
              <a href={`/wiki?path=${encodeURIComponent(it.proposedTargetCanonicalPage)}`} className="text-xs text-sky-400">
                Open target
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

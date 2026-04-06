"use client";

import { useCallback, useEffect, useState } from "react";

type Item = {
  id: string;
  sourcePath: string;
  candidateType: string;
  status: string;
  rationale?: string;
  suggestedTarget?: string;
  confidence?: string;
  createdAt: string;
};

function msgIsError(text: string) {
  return /fail|error|invalid|required|missing|not found|denied|unauthorized|forbidden/i.test(text);
}

export default function PromotionInboxPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [preview, setPreview] = useState<{ path: string; text: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const q = new URLSearchParams();
      if (status) q.set("status", status);
      if (type) q.set("type", type);
      const r = await fetch(`/api/promotion-inbox?${q}`);
      const j = (await r.json().catch(() => ({}))) as { items?: Item[]; error?: string };
      if (!r.ok) {
        setLoadError(typeof j.error === "string" ? j.error : `Load failed (${r.status})`);
        setItems([]);
        return;
      }
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch (e) {
      console.error(e);
      setLoadError("Could not load promotion inbox.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [status, type]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setItemStatus(id: string, s: string) {
    setMsg("");
    try {
      const r = await fetch("/api/promotion-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id, status: s }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setMsg(r.ok ? `Updated → ${s}` : (typeof j.error === "string" ? j.error : `Update failed (${r.status})`));
    } catch (e) {
      console.error(e);
      setMsg("Could not update item.");
    }
    void load();
  }

  async function requestCanonPromotion(it: Item) {
    setMsg("");
    const tgt = it.suggestedTarget?.trim() || target.trim();
    if (!tgt) {
      setMsg("Set target wiki path (field below) or suggestedTarget on item.");
      return;
    }
    const sourceType =
      it.candidateType === "comparative" || it.candidateType === "synthesis"
        ? "comparative_synthesis"
        : it.candidateType === "decision_memo"
          ? "decision_memo"
          : it.candidateType === "wiki"
            ? "wiki_section"
            : "promotion_inbox";
    try {
      const r = await fetch("/api/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "canon-promotion-add",
          sourceArtifactPath: it.sourcePath,
          sourceType,
          proposedTargetCanonicalPage: tgt,
          rationale: it.rationale ?? "From promotion inbox",
          promotionSummary: `Inbox ${it.id}: ${it.sourcePath}`,
          linkedPromotionInboxId: it.id,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; rec?: { id?: string } };
      setMsg(
        r.ok
          ? `Canon promotion queued — ${j.rec?.id ?? "ok"}`
          : (typeof j.error === "string" ? j.error : `Request failed (${r.status})`)
      );
    } catch (e) {
      console.error(e);
      setMsg("Could not queue canon promotion.");
    }
  }

  async function promoteNow(id: string) {
    setMsg("");
    try {
      const r = await fetch("/api/promotion-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "promote",
          id,
          targetWikiRel: target.trim() || undefined,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; wikiRel?: string };
      setMsg(
        r.ok
          ? `Promoted → ${j.wikiRel ?? "ok"}`
          : (typeof j.error === "string" ? j.error : `Promote failed (${r.status})`)
      );
    } catch (e) {
      console.error(e);
      setMsg("Could not promote item.");
    }
    void load();
  }

  async function loadPreview(path: string) {
    try {
      const r = await fetch("/api/promotion-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", sourcePath: path }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; preview?: string };
      if (r.ok && typeof j.preview === "string") setPreview({ path, text: j.preview });
      else setMsg(typeof j.error === "string" ? j.error : `Preview failed (${r.status})`);
    } catch (e) {
      console.error(e);
      setMsg("Could not load preview.");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Promotion inbox</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Single-brain staging in <code className="text-[var(--accent)]">.brain/promotion-inbox.json</code>. Use{" "}
          <strong>Promote</strong> to append provenance-tagged content to a wiki page (or create one). Does not replace
          the multi-brain <a href="/promotions" className="text-sky-400">agent promotion</a> flow.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <select
          id="promotion-inbox-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
          className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="new">new</option>
          <option value="reviewing">reviewing</option>
          <option value="approved">approved</option>
          <option value="deferred">deferred</option>
          <option value="rejected">rejected</option>
          <option value="promoted">promoted</option>
        </select>
        <select
          id="promotion-inbox-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label="Filter by candidate type"
          className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-sm"
        >
          <option value="">All types</option>
          <option value="output">output</option>
          <option value="wiki">wiki</option>
          <option value="comparative">comparative</option>
          <option value="synthesis">synthesis</option>
          <option value="decision_memo">decision_memo</option>
          <option value="other">other</option>
        </select>
        <label className="sr-only" htmlFor="promotion-inbox-target">
          Optional target wiki path
        </label>
        <input
          id="promotion-inbox-target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Optional target wiki path (e.g. wiki/topics/foo.md)"
          className="min-w-[240px] flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-mono text-xs"
        />
      </div>

      {loadError ? <p className="text-sm text-red-400">{loadError}</p> : null}
      {loading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
      {msg ? (
        <p className={`text-sm ${msgIsError(msg) ? "text-red-400" : "text-emerald-300"}`}>{msg}</p>
      ) : null}

      <ul className="space-y-3">
        {items.map((it) => (
          <li
            key={it.id}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)]/70 p-4 text-sm"
          >
            <div className="font-mono text-xs text-[var(--accent)]">{it.sourcePath}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">
              {it.candidateType} · {it.status}
              {it.confidence ? ` · ${it.confidence}` : ""} · {it.createdAt.slice(0, 10)}
            </div>
            {it.rationale ? <p className="mt-2 text-[var(--muted)]">{it.rationale}</p> : null}
            {it.suggestedTarget ? (
              <p className="mt-1 text-xs text-[var(--muted)]">Suggested: {it.suggestedTarget}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded bg-zinc-700 px-2 py-1 text-xs"
                onClick={() => void loadPreview(it.sourcePath)}
              >
                Preview
              </button>
              <button
                type="button"
                className="rounded bg-amber-800 px-2 py-1 text-xs"
                onClick={() => void setItemStatus(it.id, "reviewing")}
              >
                Reviewing
              </button>
              <button
                type="button"
                className="rounded bg-emerald-800 px-2 py-1 text-xs"
                onClick={() => void setItemStatus(it.id, "approved")}
              >
                Approve
              </button>
              <button
                type="button"
                className="rounded bg-zinc-600 px-2 py-1 text-xs"
                onClick={() => void setItemStatus(it.id, "deferred")}
              >
                Defer
              </button>
              <button
                type="button"
                className="rounded bg-red-900/70 px-2 py-1 text-xs"
                onClick={() => void setItemStatus(it.id, "rejected")}
              >
                Reject
              </button>
              <button
                type="button"
                className="rounded bg-violet-800 px-2 py-1 text-xs font-medium"
                onClick={() => void requestCanonPromotion(it)}
              >
                Request canon promotion
              </button>
              <button
                type="button"
                className="rounded bg-sky-700 px-2 py-1 text-xs font-medium"
                onClick={() => void promoteNow(it.id)}
              >
                Promote now (direct wiki merge)
              </button>
              <a
                href={`/api/wiki?path=${encodeURIComponent(it.sourcePath)}`}
                className="rounded border border-[var(--border)] px-2 py-1 text-xs"
              >
                Raw JSON
              </a>
            </div>
          </li>
        ))}
      </ul>

      {preview ? (
        <div className="rounded-lg border border-[var(--border)] bg-black/30 p-4">
          <div className="text-xs font-mono text-[var(--accent)]">{preview.path}</div>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-[var(--muted)]">
            {preview.text}
          </pre>
          <button
            type="button"
            className="mt-2 text-xs text-sky-400"
            onClick={() => setPreview(null)}
          >
            Close preview
          </button>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";

export default function DecisionDraftPage() {
  const [sourcePath, setSourcePath] = useState("raw/inbox/example.md");
  const [slugHint, setSlugHint] = useState("");
  const [preview, setPreview] = useState<{ wikiRel: string; markdown: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [msgIsError, setMsgIsError] = useState(false);

  async function doPreview() {
    setMsg("");
    setMsgIsError(false);
    try {
      const r = await fetch("/api/decision-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          sourcePath: sourcePath.trim(),
          slugHint: slugHint.trim() || undefined,
        }),
      });
      let j: { error?: string; wikiRel?: string; markdown?: string } = {};
      try {
        j = (await r.json()) as typeof j;
      } catch {
        setMsg(r.ok ? "Invalid response." : `HTTP ${r.status}`);
        setMsgIsError(true);
        setPreview(null);
        return;
      }
      if (!r.ok) {
        setMsg(j.error ?? "preview failed");
        setMsgIsError(true);
        setPreview(null);
        return;
      }
      setPreview({ wikiRel: j.wikiRel ?? "", markdown: j.markdown ?? "" });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Network error");
      setMsgIsError(true);
      setPreview(null);
    }
  }

  async function doWrite() {
    setMsg("");
    setMsgIsError(false);
    try {
      const r = await fetch("/api/decision-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "write",
          sourcePath: sourcePath.trim(),
          slugHint: slugHint.trim() || undefined,
        }),
      });
      let j: { error?: string; wikiRel?: string } = {};
      try {
        j = (await r.json()) as typeof j;
      } catch {
        setMsg(r.ok ? "Invalid response." : `HTTP ${r.status}`);
        setMsgIsError(true);
        return;
      }
      if (!r.ok) {
        setMsg(j.error ?? "write failed");
        setMsgIsError(true);
        return;
      }
      setMsg(
        `Wrote ${j.wikiRel ?? "file"} — open in wiki, then set include_in_ledger: true when ready for the ledger.`
      );
      setMsgIsError(false);
      setPreview(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Network error");
      setMsgIsError(true);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Decision draft (human confirm)</h1>
      <p className="text-sm text-[var(--muted)]">
        Preview a stub from a <code className="text-[var(--accent)]">raw/</code> or{" "}
        <code className="text-[var(--accent)]">outputs/</code> file. Nothing is written until you choose{" "}
        <strong>Write to wiki/decisions/</strong>. Stubs use <code className="text-[var(--accent)]">include_in_ledger: false</code>{" "}
        so they stay out of <code className="text-[var(--accent)]">.brain/decision-ledger.json</code> until you promote
        them in frontmatter and refresh the ledger.
      </p>
      <div className="space-y-2 text-sm">
        <label className="block">
          <span className="text-[var(--muted)]">Source path</span>
          <input
            value={sourcePath}
            onChange={(e) => setSourcePath(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-mono text-xs"
          />
        </label>
        <label className="block">
          <span className="text-[var(--muted)]">Optional slug hint</span>
          <input
            value={slugHint}
            onChange={(e) => setSlugHint(e.target.value)}
            placeholder="e.g. api-migration"
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-mono text-xs"
          />
        </label>
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={() => void doPreview()}
            className="rounded-md bg-zinc-600 px-4 py-2 text-sm text-white"
          >
            Preview
          </button>
          <button
            type="button"
            onClick={() => void doWrite()}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm text-white"
          >
            Write to wiki/decisions/
          </button>
          <Link href="/decisions" className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">
            Decision ledger →
          </Link>
        </div>
      </div>
      {msg ? (
        <p className={msgIsError ? "text-sm text-red-400" : "text-sm text-emerald-400"}>{msg}</p>
      ) : null}
      {preview ? (
        <div className="space-y-2">
          <div className="text-xs text-[var(--muted)]">
            Target: <span className="font-mono text-[var(--accent)]">{preview.wikiRel}</span>
          </div>
          <pre className="max-h-[480px] overflow-auto rounded-lg border border-[var(--border)] bg-black/40 p-3 text-[11px] leading-relaxed text-zinc-300">
            {preview.markdown}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

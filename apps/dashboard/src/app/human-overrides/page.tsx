"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

const OVERRIDE_TYPES = [
  "reject_synthesis",
  "conflict_resolution",
  "manual_canon_edit",
  "reject_canon_promotion",
  "curated_section",
  "priority_override",
  "merge_supersession_override",
  "canon_admission_override",
  "drift_resolution",
  "unsupported_claim_review",
  "decision_sunset_review",
  "canon_council_action",
  "review_session_note",
  "other",
] as const;

type Item = {
  id: string;
  relatedPath: string;
  overrideType: string;
  previousSuggestion?: string;
  humanDecision: string;
  rationale: string;
  createdAt: string;
  autoCaptured?: boolean;
  sourceWorkflow?: string;
  actionTaken?: string;
  relatedItemId?: string;
  linkedResolutionId?: string;
  linkedSnapshotId?: string;
  linkedCouncilMinutesPath?: string;
};

export default function HumanOverridesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState("");
  const [captureFilter, setCaptureFilter] = useState<"all" | "auto" | "manual">("all");
  const [form, setForm] = useState({
    relatedPath: "",
    overrideType: "other" as (typeof OVERRIDE_TYPES)[number],
    previousSuggestion: "",
    humanDecision: "",
    rationale: "",
  });
  const [msg, setMsg] = useState("");

  async function load() {
    const r = await fetch("/api/human-overrides");
    const j = await r.json();
    setItems(j.items ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    const r = await fetch("/api/human-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const j = await r.json();
    if (r.ok) {
      setMsg("Recorded.");
      setForm({ ...form, previousSuggestion: "", humanDecision: "", rationale: "" });
      void load();
    } else setMsg(j.error ?? "error");
  }

  const filtered = items.filter((i) => {
    if (captureFilter === "auto" && !i.autoCaptured) return false;
    if (captureFilter === "manual" && i.autoCaptured) return false;
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      i.relatedPath.toLowerCase().includes(q) ||
      i.overrideType.toLowerCase().includes(q) ||
      (i.rationale ?? "").toLowerCase().includes(q) ||
      (i.sourceWorkflow ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Human override journal</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Intentional divergences from AI / system suggestions — <code className="text-[var(--accent)]">.brain/human-overrides.json</code>
        </p>
        <Link href="/governance" className="mt-2 inline-block text-xs text-sky-400">
          ← Governance
        </Link>
      </header>

      <form onSubmit={submit} className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)]/50 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-[var(--muted)]">
            Related path
            <input
              value={form.relatedPath}
              onChange={(e) => setForm({ ...form, relatedPath: e.target.value })}
              placeholder="wiki/..."
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-sm"
              required
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Type
            <select
              value={form.overrideType}
              onChange={(e) => setForm({ ...form, overrideType: e.target.value as (typeof OVERRIDE_TYPES)[number] })}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-sm"
            >
              {OVERRIDE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-xs text-[var(--muted)]">
          Previous AI / system suggestion (optional)
          <textarea
            value={form.previousSuggestion}
            onChange={(e) => setForm({ ...form, previousSuggestion: e.target.value })}
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-sm"
            rows={2}
          />
        </label>
        <label className="block text-xs text-[var(--muted)]">
          Human decision
          <textarea
            value={form.humanDecision}
            onChange={(e) => setForm({ ...form, humanDecision: e.target.value })}
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-sm"
            rows={2}
            required
          />
        </label>
        <label className="block text-xs text-[var(--muted)]">
          Rationale
          <textarea
            value={form.rationale}
            onChange={(e) => setForm({ ...form, rationale: e.target.value })}
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-sm"
            rows={2}
            required
          />
        </label>
        <button type="submit" className="rounded-lg bg-emerald-800/80 px-4 py-2 text-sm">
          Record override
        </button>
        {msg ? <p className="text-sm text-emerald-300">{msg}</p> : null}
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full max-w-sm rounded border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
          Capture
          <select
            value={captureFilter}
            onChange={(e) => setCaptureFilter(e.target.value as typeof captureFilter)}
            className="rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
          >
            <option value="all">All</option>
            <option value="auto">Auto-captured</option>
            <option value="manual">Manual journal</option>
          </select>
        </label>
      </div>
      <div>
        <ul className="space-y-3">
          {filtered.map((i) => (
            <li key={i.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)]/40 p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-mono text-xs text-[var(--accent)]">{i.relatedPath}</span>
                <span className="text-xs text-[var(--muted)]">{i.createdAt.slice(0, 10)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-amber-200/90">
                <span>{i.overrideType}</span>
                {i.sourceWorkflow ? (
                  <span className="text-[var(--muted)]">· {i.sourceWorkflow}</span>
                ) : null}
                {i.autoCaptured ? (
                  <span className="rounded bg-zinc-800 px-1 text-[10px] text-zinc-300">auto</span>
                ) : null}
              </div>
              {i.actionTaken ? (
                <p className="mt-1 text-xs text-sky-200/80">
                  <strong>Action:</strong> {i.actionTaken}
                </p>
              ) : null}
              <p className="mt-2 text-[var(--foreground)]">
                <strong>Decision:</strong> {i.humanDecision}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">{i.rationale}</p>
              {i.linkedResolutionId ? (
                <p className="mt-1 text-[10px] font-mono text-[var(--muted)]">resolution: {i.linkedResolutionId}</p>
              ) : null}
              {i.linkedSnapshotId ? (
                <p className="mt-1 text-[10px] font-mono text-[var(--muted)]">snapshot: {i.linkedSnapshotId}</p>
              ) : null}
              {i.linkedCouncilMinutesPath ? (
                <p className="mt-1 text-[10px] font-mono text-emerald-200/80">minutes: {i.linkedCouncilMinutesPath}</p>
              ) : null}
              {i.previousSuggestion ? (
                <p className="mt-2 text-xs text-[var(--muted)] line-through opacity-70">AI: {i.previousSuggestion}</p>
              ) : null}
              <Link href={`/wiki?path=${encodeURIComponent(i.relatedPath)}`} className="mt-2 inline-block text-xs text-sky-400">
                Open page
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

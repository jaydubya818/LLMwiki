"use client";

import { useCallback, useEffect, useState } from "react";

type GitFile = { path: string; workingDir: string };
type Decision = "pending" | "approved" | "rejected";

export default function DiffPage() {
  const [patch, setPatch] = useState("");
  const [files, setFiles] = useState<GitFile[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [trustNote, setTrustNote] = useState("");
  const [suggestedMsg, setSuggestedMsg] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch("/api/diff");
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}`);
      }
      const j = (await r.json()) as Record<string, unknown>;
      setPatch(typeof j.patch === "string" ? j.patch : "");
      setFiles(Array.isArray(j.files) ? (j.files as GitFile[]) : []);
      setTrustNote(typeof j.trustNote === "string" ? j.trustNote : "");
      setSuggestedMsg(
        typeof j.suggestedCommitMessage === "string" ? j.suggestedCommitMessage : ""
      );
      if (j.reviewState && typeof j.reviewState === "object" && j.reviewState !== null) {
        const decisionFiles = (j.reviewState as { files?: unknown }).files;
        if (decisionFiles && typeof decisionFiles === "object") {
          setDecisions(decisionFiles as Record<string, Decision>);
        }
      }
    } catch (e) {
      console.error("[diff] load failed:", e);
      setPatch("");
      setFiles([]);
      setTrustNote("");
      setSuggestedMsg("");
      setDecisions({});
      setLoadError("Could not load diff. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitDecision(filePath: string, decision: Decision) {
    setActionError(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath, decision }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(detail ? `HTTP ${res.status}: ${detail.slice(0, 200)}` : `HTTP ${res.status}`);
      }
      setDecisions((d) => ({ ...d, [filePath]: decision }));
    } catch (e) {
      console.error("[diff] review persist failed:", e);
      setActionError("Could not save decision. Try again.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">Diff review</h1>
      {loading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
      {loadError ? <p className="text-sm text-red-400">{loadError}</p> : null}
      {actionError ? <p className="text-sm text-red-400">{actionError}</p> : null}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]/50 p-4 text-sm">
        <p className="text-[var(--foreground)]">{trustNote}</p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Approve or reject per path below. <strong>Reject</strong> restores that path from the last
          commit. When finished, run{" "}
          <code className="rounded bg-black/30 px-1">brain approve</code> in your terminal to commit{" "}
          <em>approved</em> paths only. Use{" "}
          <code className="rounded bg-black/30 px-1">brain approve --all -m &quot;…&quot;</code> only
          if you reviewed the full patch.
        </p>
        {suggestedMsg ? (
          <p className="mt-2 font-mono text-xs text-[var(--accent)]">
            Suggested message: {suggestedMsg}
          </p>
        ) : null}
      </div>
      <ul className="space-y-2 text-sm">
        {files.map((f) => {
          const d = decisions[f.path] ?? "pending";
          return (
            <li
              key={f.path}
              className="flex flex-col gap-2 rounded-md border border-[var(--border)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="font-mono text-xs text-[var(--accent)]">{f.path}</div>
                <div className="text-xs text-[var(--muted)]">
                  git: {f.workingDir}
                  {d !== "pending" ? (
                    <span
                      className={`ml-2 font-medium ${
                        d === "approved" ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      · marked {d}
                    </span>
                  ) : (
                    <span className="ml-2 text-amber-400">· not reviewed in UI</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded bg-emerald-700 px-2 py-1 text-xs"
                  onClick={() => void submitDecision(f.path, "approved")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="rounded bg-red-900 px-2 py-1 text-xs"
                  onClick={() => void submitDecision(f.path, "rejected")}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="rounded border border-[var(--border)] px-2 py-1 text-xs"
                  onClick={() => void submitDecision(f.path, "pending")}
                >
                  Clear
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {!loading && !loadError && files.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No uncommitted wiki changes in scope.</p>
      ) : null}
      <pre className="max-h-[560px] overflow-auto rounded-lg bg-black/50 p-4 text-xs text-[var(--foreground)]">
        {patch || "(no diff)"}
      </pre>
    </div>
  );
}

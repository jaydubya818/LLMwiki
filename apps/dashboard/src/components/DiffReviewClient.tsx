"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Decision = "pending" | "approved" | "rejected";

type EnrichedFile = {
  path: string;
  workingDir: string;
  domain: string;
  mtimeMs: number | null;
  decision: Decision;
  inferredSource: string;
};

type SuggestedCtx = {
  ingestStartedAt?: string;
  ingestFinishedAt?: string;
  ingestId?: string;
  likelyStaleAfterNewIngest: boolean;
};

type Activity = {
  lastIngest: { startedAt: string; summary: string; ok: boolean } | null;
  lastLint: { startedAt: string; summary: string; ok: boolean } | null;
  lastReview: { startedAt: string; summary: string; ok: boolean } | null;
};

const SOURCE_LABEL: Record<string, string> = {
  ingest: "Ingest",
  compile: "Compile",
  lint: "Lint",
  review: "Review",
  manual: "Manual / other",
  unknown: "Unknown",
};

function decisionBadge(d: Decision) {
  if (d === "approved") return "border-emerald-500/50 bg-emerald-950/30 text-emerald-200";
  if (d === "rejected") return "border-red-500/45 bg-red-950/30 text-red-200";
  return "border-amber-500/45 bg-amber-950/25 text-amber-100";
}

function shortWikiPath(repoPath: string) {
  const i = repoPath.indexOf("/wiki/");
  return i >= 0 ? repoPath.slice(i + 1) : repoPath;
}

function formatMtime(ms: number | null) {
  if (ms == null) return "—";
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function parseEnrichedFiles(raw: unknown): EnrichedFile[] {
  if (!Array.isArray(raw)) return [];
  const out: EnrichedFile[] = [];
  for (const el of raw) {
    if (!el || typeof el !== "object") continue;
    const r = el as Record<string, unknown>;
    if (typeof r.path !== "string" || !r.path.trim()) continue;
    const dec = r.decision;
    const decision: Decision =
      dec === "approved" || dec === "rejected" || dec === "pending" ? dec : "pending";
    const workingDir = typeof r.workingDir === "string" ? r.workingDir : "";
    const domain = typeof r.domain === "string" && r.domain.trim() ? r.domain : "topics";
    const mtimeMs =
      typeof r.mtimeMs === "number" && Number.isFinite(r.mtimeMs)
        ? r.mtimeMs
        : r.mtimeMs === null
          ? null
          : null;
    const inferredSource = typeof r.inferredSource === "string" ? r.inferredSource : "unknown";
    out.push({ path: r.path, workingDir, domain, mtimeMs, decision, inferredSource });
  }
  return out;
}

export function DiffReviewClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileQ = searchParams.get("file");

  const [files, setFiles] = useState<EnrichedFile[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [trustNote, setTrustNote] = useState("");
  const [suggestedMsg, setSuggestedMsg] = useState("");
  const [suggestedCtx, setSuggestedCtx] = useState<SuggestedCtx | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [patch, setPatch] = useState("");
  const [globalPatchLoading, setGlobalPatchLoading] = useState(true);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState("");
  const [headContent, setHeadContent] = useState("");
  const [workContent, setWorkContent] = useState("");
  const [fileLoading, setFileLoading] = useState(false);

  const [commitMsg, setCommitMsg] = useState("");
  const [commitEdited, setCommitEdited] = useState(false);
  const commitEditedRef = useRef(false);
  useEffect(() => {
    commitEditedRef.current = commitEdited;
  }, [commitEdited]);
  const [sideBySide, setSideBySide] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  /** Shown under commit actions when API commit returned ok but nothing was committed (e.g. no approved paths). */
  const [commitPanelNotice, setCommitPanelNotice] = useState<string | null>(null);
  const [commitLoading, setCommitLoading] = useState(false);

  const flatPaths = useMemo(() => files.map((f) => f.path), [files]);

  const mergedDecisions = useCallback(
    (path: string): Decision => decisions[path] ?? files.find((f) => f.path === path)?.decision ?? "pending",
    [decisions, files]
  );

  const counts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const f of files) {
      const d = mergedDecisions(f.path);
      if (d === "pending") pending++;
      else if (d === "approved") approved++;
      else rejected++;
    }
    return { pending, approved, rejected };
  }, [files, mergedDecisions]);

  const orphanReviewDecisionCount = useMemo(() => {
    if (files.length > 0) return 0;
    return Object.keys(decisions).length;
  }, [files.length, decisions]);

  const grouped = useMemo(() => {
    const m = new Map<string, EnrichedFile[]>();
    for (const f of files) {
      const arr = m.get(f.domain) ?? [];
      arr.push(f);
      m.set(f.domain, arr);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [files]);

  const loadAll = useCallback(async () => {
    setGlobalPatchLoading(true);
    setLoadError(null);
    try {
      const r = await fetch("/api/diff");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as Record<string, unknown>;
      setPatch(typeof j.patch === "string" ? j.patch : "");
      setFiles(parseEnrichedFiles(j.files));
      setTrustNote(typeof j.trustNote === "string" ? j.trustNote : "");
      const sug = typeof j.suggestedCommitMessage === "string" ? j.suggestedCommitMessage : "";
      setSuggestedMsg(sug);
      if (!commitEditedRef.current) setCommitMsg(sug);
      setSuggestedCtx((j.suggestedCommitContext as SuggestedCtx) ?? null);
      setActivity((j.activity as Activity) ?? null);
      if (j.reviewState && typeof j.reviewState === "object" && j.reviewState !== null) {
        const decisionFiles = (j.reviewState as { files?: unknown }).files;
        if (decisionFiles && typeof decisionFiles === "object") {
          setDecisions(decisionFiles as Record<string, Decision>);
        }
      }
    } catch (e) {
      console.error(e);
      setLoadError("Could not load diff.");
      setFiles([]);
      setPatch("");
    } finally {
      setGlobalPatchLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!files.length) {
      setSelectedPath(null);
      return;
    }
    const decisionFor = (p: string): Decision =>
      decisions[p] ?? files.find((f) => f.path === p)?.decision ?? "pending";
    const validQ = fileQ && files.some((f) => f.path === fileQ) ? fileQ : null;
    const fallback =
      files.find((f) => decisionFor(f.path) === "pending")?.path ?? files[0]?.path ?? null;
    setSelectedPath((prev) => {
      if (validQ) return validQ;
      if (prev && files.some((f) => f.path === prev)) return prev;
      return fallback;
    });
  }, [files, fileQ, decisions]);

  const loadFile = useCallback(async (repoPath: string) => {
    setFileLoading(true);
    setActionError(null);
    try {
      const r = await fetch(`/api/diff?file=${encodeURIComponent(repoPath)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as {
        fileDiff?: string;
        headContent?: string;
        workContent?: string;
      };
      setFileDiff(typeof j.fileDiff === "string" ? j.fileDiff : "");
      setHeadContent(typeof j.headContent === "string" ? j.headContent : "");
      setWorkContent(typeof j.workContent === "string" ? j.workContent : "");
    } catch (e) {
      console.error(e);
      setFileDiff("(could not load file diff)");
      setHeadContent("");
      setWorkContent("");
    } finally {
      setFileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPath) {
      void loadFile(selectedPath);
      router.replace(`/diff?file=${encodeURIComponent(selectedPath)}`, { scroll: false });
    }
  }, [selectedPath, loadFile, router]);

  const selectIndex = selectedPath ? flatPaths.indexOf(selectedPath) : -1;

  const goNext = useCallback(() => {
    if (flatPaths.length === 0) return;
    const i = selectIndex < 0 ? 0 : Math.min(flatPaths.length - 1, selectIndex + 1);
    setSelectedPath(flatPaths[i]);
  }, [flatPaths, selectIndex]);

  const goPrev = useCallback(() => {
    if (flatPaths.length === 0) return;
    const i = selectIndex <= 0 ? 0 : selectIndex - 1;
    setSelectedPath(flatPaths[i]);
  }, [flatPaths, selectIndex]);

  const goNextUndecided = useCallback(() => {
    const start = Math.max(0, selectIndex);
    const rest = flatPaths.slice(start + 1).concat(flatPaths.slice(0, start + 1));
    const found = rest.find((p) => mergedDecisions(p) === "pending");
    if (found) setSelectedPath(found);
  }, [flatPaths, mergedDecisions, selectIndex]);

  useEffect(() => {
    const inField = (t: EventTarget | null) =>
      t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement || t instanceof HTMLSelectElement;

    function onKey(ev: KeyboardEvent) {
      if (inField(ev.target)) return;
      if (ev.key === "?" || (ev.shiftKey && ev.key === "/")) {
        ev.preventDefault();
        setShowShortcuts((s) => !s);
        return;
      }
      if (ev.key === "j" || ev.key === "ArrowDown") {
        ev.preventDefault();
        goNext();
      }
      if (ev.key === "k" || ev.key === "ArrowUp") {
        ev.preventDefault();
        goPrev();
      }
      if (ev.key === "n") {
        ev.preventDefault();
        goNextUndecided();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, goNextUndecided]);

  async function submitDecision(filePath: string, decision: Decision) {
    setActionError(null);
    setActionOk(null);
    setCommitPanelNotice(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath, decision }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDecisions((d) => ({ ...d, [filePath]: decision }));
      setFiles((prev) =>
        prev.map((f) => (f.path === filePath ? { ...f, decision } : f))
      );
    } catch (e) {
      console.error(e);
      setActionError("Could not save decision.");
    }
  }

  function resetCommitToSuggested() {
    setCommitMsg(suggestedMsg);
    setCommitEdited(false);
  }

  async function postApprove(opts: {
    approveAllPending?: boolean;
    mode: "commit" | "decisions_only";
  }) {
    setActionError(null);
    setActionOk(null);
    setCommitPanelNotice(null);
    const msg = commitMsg.trim();
    if (opts.mode === "commit" && !msg) {
      setActionError("Add a commit message before committing.");
      return;
    }
    setCommitLoading(true);
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commitMessage: opts.mode === "commit" ? msg : undefined,
          approveAllPending: !!opts.approveAllPending,
          mode: opts.mode,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        committed?: boolean;
      };
      if (!res.ok) {
        setActionError(typeof j.error === "string" ? j.error : `HTTP ${res.status}`);
        return;
      }
      const message = typeof j.message === "string" ? j.message : "Done.";
      const committed = j.committed === true;
      if (opts.mode === "commit" && !committed) {
        setCommitPanelNotice(message);
        setActionOk(null);
      } else {
        setCommitPanelNotice(null);
        setActionOk(message);
      }
      await loadAll();
      setCommitEdited(false);
    } catch (e) {
      setActionError(String(e));
    } finally {
      setCommitLoading(false);
    }
  }

  const selectedFile = files.find((f) => f.path === selectedPath) ?? null;
  const dSel = selectedPath ? mergedDecisions(selectedPath) : "pending";

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Diff review</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Git is the <strong className="text-[var(--foreground)]">trust boundary</strong>: nothing is canon until
            you read the diff, mark each path, and commit. Rejected paths are restored from{" "}
            <code className="text-[var(--accent)]">HEAD</code> when you commit approved changes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowShortcuts((s) => !s)}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:border-[var(--accent)]"
        >
          Shortcuts (?)
        </button>
      </header>

      {showShortcuts ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]/60 p-4 text-xs text-[var(--muted)]">
          <strong className="text-[var(--foreground)]">Keyboard</strong> (not while typing in a field):{" "}
          <kbd className="rounded border border-[var(--border)] px-1">j</kbd> /{" "}
          <kbd className="rounded border border-[var(--border)] px-1">k</kbd> next/previous file,{" "}
          <kbd className="rounded border border-[var(--border)] px-1">n</kbd> next undecided,{" "}
          <kbd className="rounded border border-[var(--border)] px-1">?</kbd> toggle this help.
        </div>
      ) : null}

      {globalPatchLoading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
      {loadError ? <p className="text-sm text-red-400">{loadError}</p> : null}
      {actionError ? <p className="text-sm text-red-400">{actionError}</p> : null}
      {actionOk ? <p className="text-sm text-emerald-400">{actionOk}</p> : null}

      <section className="rounded-xl border border-[var(--border)] bg-gradient-to-b from-[var(--card)]/80 to-[var(--card)]/40 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Trust & activity</h2>
        <p className="mt-2 text-sm text-[var(--foreground)]">{trustNote}</p>
        <div className="mt-3 grid gap-2 text-xs text-[var(--muted)] sm:grid-cols-3">
          <div className="rounded-md border border-[var(--border)]/60 bg-black/20 p-2">
            <div className="font-medium text-[var(--foreground)]">Last ingest</div>
            <div className="mt-1 truncate">
              {activity?.lastIngest
                ? `${activity.lastIngest.startedAt.slice(0, 19)} · ${activity.lastIngest.summary}`
                : "—"}
            </div>
          </div>
          <div className="rounded-md border border-[var(--border)]/60 bg-black/20 p-2">
            <div className="font-medium text-[var(--foreground)]">Last lint</div>
            <div className="mt-1 truncate">
              {activity?.lastLint
                ? `${activity.lastLint.startedAt.slice(0, 19)} · ${activity.lastLint.summary}`
                : "—"}
            </div>
          </div>
          <div className="rounded-md border border-[var(--border)]/60 bg-black/20 p-2">
            <div className="font-medium text-[var(--foreground)]">Last weekly review</div>
            <div className="mt-1 truncate">
              {activity?.lastReview
                ? `${activity.lastReview.startedAt.slice(0, 19)} · ${activity.lastReview.summary}`
                : "—"}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${
              counts.pending > 0
                ? "border-amber-500/50 text-amber-200"
                : "border-emerald-500/40 text-emerald-200/90"
            }`}
          >
            {counts.pending} undecided
          </span>
          <span className="rounded-full border border-emerald-500/35 px-2 py-0.5 text-xs text-emerald-200/90">
            {counts.approved} approved
          </span>
          <span className="rounded-full border border-red-500/35 px-2 py-0.5 text-xs text-red-200/90">
            {counts.rejected} rejected
          </span>
        </div>
        {files.length > 0 && counts.pending === 0 ? (
          <p className="mt-3 text-sm text-sky-200/90">
            Every listed file has a decision.
            {counts.approved > 0
              ? ` Next: commit ${counts.approved} approved path(s) below (rejected paths reset to HEAD on commit).`
              : " Next: approve at least one path to commit, or wait for a new ingest if you meant to ship later."}
          </p>
        ) : null}
        {suggestedCtx?.likelyStaleAfterNewIngest ? (
          <p className="mt-3 text-xs text-amber-200/95">
            A new ingest may have landed after your last Diff UI save — re-check undecided files and the suggested
            commit message.
          </p>
        ) : null}
      </section>

      {!globalPatchLoading && !loadError && files.length === 0 ? (
        <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/15 p-6 text-left sm:text-center">
          <p className="font-medium text-emerald-200/95">Nothing to review — wiki working tree matches the last commit</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--muted)]">
            There are no modified <code className="text-[var(--accent)]">wiki/</code> files in git. Ingest only adds work
            here when it proposes edits you have not committed yet.
          </p>
          <ul className="mx-auto mt-4 max-w-xl space-y-2 text-left text-sm text-[var(--muted)]">
            <li className="flex gap-2">
              <span className="text-emerald-400/80">1.</span>
              <span>
                Add or update notes under <code className="text-[var(--accent)]">raw/</code>, then run{" "}
                <code className="text-[var(--accent)]">brain ingest</code> (or use <strong>Ingest</strong> from{" "}
                <Link href="/" className="text-sky-400 underline">
                  Home
                </Link>
                ).
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-400/80">2.</span>
              <span>
                If your weekly batch is done, continue with <code className="text-[var(--accent)]">brain review</code>{" "}
                and <code className="text-[var(--accent)]">brain lint</code> — no commit needed on this page until there
                are new diffs.
              </span>
            </li>
          </ul>
          {orphanReviewDecisionCount > 0 ? (
            <div className="mx-auto mt-5 max-w-xl rounded-lg border border-amber-500/35 bg-amber-950/20 p-4 text-left text-xs text-amber-100/95">
              <strong className="text-amber-200">Saved decisions still on disk</strong>
              <p className="mt-1 text-amber-100/85">
                <code className="text-[var(--accent)]">.brain/review-state.json</code> lists{" "}
                {orphanReviewDecisionCount} path(s) — usually harmless until those files show up in a diff again. If you
                reset the repo or committed outside the dashboard, you can edit that file to clear stale rows.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
          <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => goNextUndecided()}
                className="rounded-md bg-amber-600/85 px-2 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
              >
                Next undecided
              </button>
              <button
                type="button"
                onClick={() => void loadAll()}
                className="rounded-md border border-[var(--border)] px-2 py-1.5 text-xs hover:border-[var(--accent)]"
              >
                Refresh
              </button>
            </div>
            <div className="max-h-[min(70vh,720px)] space-y-4 overflow-y-auto pr-1">
              {grouped.map(([domain, group]) => (
                <div key={domain}>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    {domain}
                  </div>
                  <ul className="space-y-1">
                    {group.map((f) => {
                      const d = mergedDecisions(f.path);
                      const active = f.path === selectedPath;
                      return (
                        <li key={f.path}>
                          <button
                            type="button"
                            onClick={() => setSelectedPath(f.path)}
                            className={`w-full rounded-lg border px-2 py-2 text-left text-xs transition ${
                              active
                                ? "border-sky-500/60 bg-sky-950/35"
                                : "border-[var(--border)] bg-[var(--card)]/40 hover:border-sky-500/50"
                            } ${d === "pending" ? "ring-1 ring-amber-500/20" : ""}`}
                          >
                            <div className="break-all font-mono text-[11px] text-[var(--accent)]">
                              {shortWikiPath(f.path)}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span
                                className={`rounded border px-1 py-0 text-[10px] ${decisionBadge(d)}`}
                              >
                                {d}
                              </span>
                              <span className="text-[10px] text-[var(--muted)]">
                                {SOURCE_LABEL[f.inferredSource] ?? f.inferredSource}
                              </span>
                              <span className="text-[10px] text-[var(--muted)]">
                                {formatMtime(f.mtimeMs)}
                              </span>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            {selectedFile ? (
              <>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase text-[var(--muted)]">
                        Selected file
                      </div>
                      <div className="break-all font-mono text-sm text-[var(--accent)]">
                        {selectedFile.path}
                      </div>
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        Git: {selectedFile.workingDir} · Source hint:{" "}
                        {SOURCE_LABEL[selectedFile.inferredSource] ?? selectedFile.inferredSource} · Modified{" "}
                        {formatMtime(selectedFile.mtimeMs)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => goPrev()}
                        className="rounded border border-[var(--border)] px-2 py-1 text-xs"
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        onClick={() => goNext()}
                        className="rounded border border-[var(--border)] px-2 py-1 text-xs"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                  <div
                    className={`mt-3 rounded-lg border p-3 text-sm ${
                      dSel === "approved"
                        ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-100/95"
                        : dSel === "rejected"
                          ? "border-red-500/40 bg-red-950/25 text-red-100/90"
                          : "border-amber-500/35 bg-amber-950/15 text-amber-100/95"
                    }`}
                  >
                    {dSel === "approved" && (
                      <>
                        <strong>Approved</strong> — this path will be included in the next wiki commit.
                      </>
                    )}
                    {dSel === "rejected" && (
                      <>
                        <strong>Rejected</strong> — on commit, this file is reset to <code>HEAD</code> for that
                        path.
                      </>
                    )}
                    {dSel === "pending" && (
                      <>
                        <strong>Undecided</strong> — choose approve or reject before committing.
                      </>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
                      onClick={() => void submitDecision(selectedFile.path, "approved")}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-red-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
                      onClick={() => void submitDecision(selectedFile.path, "rejected")}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--accent)]"
                      onClick={() => void submitDecision(selectedFile.path, "pending")}
                    >
                      Clear
                    </button>
                    <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-[var(--muted)]">
                      <input
                        type="checkbox"
                        checked={sideBySide}
                        onChange={(e) => setSideBySide(e.target.checked)}
                      />
                      Side-by-side (markdown)
                    </label>
                  </div>
                </div>

                {fileLoading ? (
                  <p className="text-xs text-[var(--muted)]">Loading file…</p>
                ) : sideBySide ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="rounded-lg border border-[var(--border)]">
                      <div className="border-b border-[var(--border)] bg-black/30 px-2 py-1 text-[10px] uppercase text-[var(--muted)]">
                        HEAD
                      </div>
                      <pre className="max-h-[420px] overflow-auto p-3 text-[11px] text-[var(--foreground)] whitespace-pre-wrap">
                        {headContent || "—"}
                      </pre>
                    </div>
                    <div className="rounded-lg border border-[var(--border)]">
                      <div className="border-b border-[var(--border)] bg-black/30 px-2 py-1 text-[10px] uppercase text-[var(--muted)]">
                        Working tree
                      </div>
                      <pre className="max-h-[420px] overflow-auto p-3 text-[11px] text-[var(--foreground)] whitespace-pre-wrap">
                        {workContent || "—"}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <pre className="max-h-[480px] overflow-auto rounded-lg border border-[var(--border)] bg-black/45 p-4 text-[11px] leading-relaxed text-[var(--foreground)]">
                    {fileDiff || "(no textual diff)"}
                  </pre>
                )}
              </>
            ) : null}

            <section className="rounded-xl border border-[var(--border)] bg-[var(--card)]/40 p-4">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Full wiki patch (reference)</h3>
              <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-black/40 p-3 text-[10px] text-[var(--muted)]">
                {patch || "(no aggregate diff)"}
              </pre>
            </section>

            <section className="rounded-xl border border-violet-500/30 bg-violet-950/15 p-5">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Commit approved changes</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Edit the message below, then commit. Only <strong>approved</strong> paths are staged. Rejected paths
                are checked out from HEAD before the commit runs.
              </p>

              <div
                role="status"
                className={`mt-3 rounded-lg border p-3 text-xs leading-relaxed ${
                  counts.approved > 0 && counts.pending === 0
                    ? "border-emerald-500/35 bg-emerald-950/25 text-emerald-100/95"
                    : counts.approved > 0 && counts.pending > 0
                      ? "border-amber-500/35 bg-amber-950/20 text-amber-100/95"
                      : counts.approved === 0 && counts.pending > 0
                        ? "border-amber-500/35 bg-amber-950/20 text-amber-100/95"
                        : "border-[var(--border)] bg-black/25 text-[var(--muted)]"
                }`}
              >
                {counts.approved > 0 && counts.pending === 0 ? (
                  <>
                    <strong className="text-emerald-200">Ready to commit</strong> — {counts.approved} approved path
                    {counts.approved === 1 ? "" : "s"}
                    {counts.rejected > 0
                      ? `; ${counts.rejected} rejected path${counts.rejected === 1 ? "" : "s"} will be restored from HEAD when you commit.`
                      : "."}
                  </>
                ) : counts.approved > 0 && counts.pending > 0 ? (
                  <>
                    <strong className="text-amber-200">Partially decided</strong> — you can commit {counts.approved}{" "}
                    approved path{counts.approved === 1 ? "" : "s"} now, or finish the{" "}
                    {counts.pending} undecided file
                    {counts.pending === 1 ? "" : "s"} first (undecided paths are not included in the commit).
                  </>
                ) : counts.approved === 0 && counts.pending > 0 ? (
                  <>
                    <strong className="text-amber-200">Nothing approved yet</strong> — approve at least one file or use{" "}
                    <strong>Approve all + commit</strong> after you have read the diffs. The commit button stays disabled
                    until there is at least one approved path.
                  </>
                ) : counts.approved === 0 && counts.pending === 0 && files.length > 0 ? (
                  <>
                    <strong className="text-[var(--foreground)]">No approved paths</strong> — every listed file is
                    rejected or cleared from approve. To ship changes, set at least one path to{" "}
                    <strong>Approve</strong>, or run <code className="text-[var(--accent)]">brain ingest</code> for new
                    proposals.
                  </>
                ) : null}
              </div>
              <label className="mt-3 block text-[10px] font-semibold uppercase text-[var(--muted)]">
                Commit message
              </label>
              <textarea
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-black/35 p-3 font-mono text-sm text-[var(--foreground)]"
                rows={3}
                value={commitMsg}
                onChange={(e) => {
                  setCommitMsg(e.target.value);
                  setCommitEdited(true);
                }}
                placeholder="wiki: describe your reviewed changes"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => resetCommitToSuggested()}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]"
                >
                  Reset to suggested
                </button>
                <span className="self-center text-[10px] text-[var(--muted)]">
                  Suggested from last ingest:{" "}
                  <span className="font-mono text-[var(--accent)]">{suggestedMsg || "—"}</span>
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={commitLoading || counts.approved === 0}
                  onClick={() => void postApprove({ mode: "commit" })}
                  className="rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Commit approved ({counts.approved})
                </button>
                <button
                  type="button"
                  disabled={commitLoading || counts.pending === 0}
                  title={
                    counts.pending === 0
                      ? "No undecided files — use Commit approved, or change individual paths to Approve first."
                      : undefined
                  }
                  onClick={() => {
                    if (!confirm("Mark every undecided path as approved, then commit with this message?")) return;
                    void postApprove({ approveAllPending: true, mode: "commit" });
                  }}
                  className="rounded-md border border-violet-500/50 px-3 py-2 text-sm text-violet-100 hover:bg-violet-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Approve all + commit
                </button>
                <button
                  type="button"
                  disabled={commitLoading}
                  onClick={() =>
                    void postApprove({ mode: "decisions_only" })
                  }
                  className="rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:border-[var(--accent)]"
                >
                  Save decisions only
                </button>
              </div>
              {commitPanelNotice ? (
                <p
                  className="mt-3 rounded-lg border border-amber-500/40 bg-amber-950/25 px-3 py-2 text-xs leading-relaxed text-amber-100/95"
                  role="status"
                >
                  {commitPanelNotice}
                </p>
              ) : null}
              <p className="mt-3 text-[10px] text-[var(--muted)]">
                CLI fallback: <code className="text-[var(--accent)]">brain approve</code> (uses the same review
                state; pass <code className="text-[var(--accent)]">-m &quot;…&quot;</code> if you skip the
                dashboard).
              </p>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}

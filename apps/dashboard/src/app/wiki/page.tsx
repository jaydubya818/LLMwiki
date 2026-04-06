"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { WikiSidebar } from "@/components/WikiSidebar";

type TraceSection = {
  id: string;
  heading: string;
  support: string;
  sources: { path: string; lastIngestedAt?: string }[];
  notes?: string;
};

function WikiBody() {
  const sp = useSearchParams();
  const path = sp.get("path") ?? "wiki/INDEX.md";
  const traceSectionQ = sp.get("traceSection");
  const panelQ = sp.get("panel");
  const tracePanelRef = useRef<HTMLDivElement>(null);
  const [tree, setTree] = useState<string[]>([]);
  const [data, setData] = useState<{
    content?: string;
    frontmatter?: Record<string, unknown>;
    wikilinks?: string[];
    vaultName?: string;
    vaultNameSource?: string;
    obsidianOpenUrl?: string;
    error?: string;
  } | null>(null);
  const [freshness, setFreshness] = useState<{
    category: string;
    explain: string;
  } | null>(null);
  const [trace, setTrace] = useState<{ sections: TraceSection[] } | null>(null);
  const [selTrace, setSelTrace] = useState<string | null>(null);
  const [pageQ, setPageQ] = useState<{
    bucket: string;
    score0to100: number;
    reasons: string[];
  } | null>(null);
  const [evidenceAlerts, setEvidenceAlerts] = useState<
    { id: string; changeSummary: string; severity: string; why: string }[]
  >([]);
  const [evidenceD, setEvidenceD] = useState<{
    bucket: string;
    score0to100: number;
    reasons: string[];
    sectionWithSources: number;
    sectionTotal: number;
    rawSourceCount: number;
  } | null>(null);
  const [humanR, setHumanR] = useState<{ badge: string; staleAfterEdit: boolean } | null>(null);
  const [humanReviewLoading, setHumanReviewLoading] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [govActionMsg, setGovActionMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [confHist, setConfHist] = useState<{
    trend: string;
    current?: { composite0to100: number; at: string };
    recentDelta?: number;
    sparkline: number[];
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setData(null);
    setFreshness(null);
    setTrace(null);
    setSelTrace(null);
    setPageQ(null);
    setEvidenceAlerts([]);
    setEvidenceD(null);
    setHumanR(null);
    setConfHist(null);

    void (async () => {
      try {
        const [wikiR, treeR] = await Promise.all([
          fetch(`/api/wiki?path=${encodeURIComponent(path)}`, { signal }),
          fetch("/api/wiki-tree", { signal }),
        ]);

        if (signal.aborted) return;

        if (!wikiR.ok) {
          console.error("[wiki] wiki fetch failed:", wikiR.status);
          setData({ error: `Could not load page (HTTP ${wikiR.status}).` });
        } else {
          try {
            const j = await wikiR.json();
            if (signal.aborted) return;
            setData(j);
          } catch (e) {
            console.error("[wiki] wiki JSON parse failed:", e);
            if (signal.aborted) return;
            setData({ error: "Could not load page (invalid response)." });
          }
        }

        if (signal.aborted) return;

        if (!treeR.ok) {
          console.error("[wiki] tree fetch failed:", treeR.status);
          setTree([]);
        } else {
          try {
            const t = await treeR.json();
            if (signal.aborted) return;
            setTree(Array.isArray(t.files) ? t.files : []);
          } catch (e) {
            console.error("[wiki] tree JSON parse failed:", e);
            if (signal.aborted) return;
            setTree([]);
          }
        }

        if (path.startsWith("wiki/")) {
          const [fr, tr, pq, gov, ed, hr, ch] = await Promise.all([
            fetch(`/api/page-freshness?path=${encodeURIComponent(path)}`, { signal }),
            fetch(`/api/wiki-trace?path=${encodeURIComponent(path)}`, { signal }),
            fetch(`/api/page-quality?path=${encodeURIComponent(path)}`, { signal }),
            fetch("/api/governance", { signal }),
            fetch(`/api/evidence-density?path=${encodeURIComponent(path)}`, { signal }),
            fetch(`/api/human-review?path=${encodeURIComponent(path)}`, { signal }),
            fetch(`/api/confidence-history?path=${encodeURIComponent(path)}`, { signal }),
          ]);
          if (signal.aborted) return;
          if (fr.ok) {
            try {
              const fj = await fr.json();
              if (fj?.freshness) setFreshness(fj.freshness);
            } catch (e) {
              console.error("[wiki] freshness JSON parse failed:", e);
            }
          }
          if (tr.ok) {
            try {
              const tj = await tr.json();
              if (tj?.trace?.sections?.length) setTrace(tj.trace);
            } catch (e) {
              console.error("[wiki] trace JSON parse failed:", e);
            }
          }
          if (pq.ok) {
            try {
              const qj = await pq.json();
              if (qj?.row) {
                setPageQ({
                  bucket: qj.row.bucket,
                  score0to100: qj.row.score0to100,
                  reasons: qj.row.reasons ?? [],
                });
              }
            } catch (e) {
              console.error("[wiki] page-quality JSON parse failed:", e);
            }
          }
          if (gov.ok) {
            try {
              const gj = (await gov.json()) as {
                evidenceAlerts?: { alerts?: { id: string; pagePath: string; changeSummary: string; severity: string; why: string; status: string }[] };
              };
              const alerts = (gj.evidenceAlerts?.alerts ?? []).filter(
                (a) => a.pagePath === path && a.status === "new"
              );
              setEvidenceAlerts(
                alerts.slice(0, 6).map((a) => ({
                  id: a.id,
                  changeSummary: a.changeSummary,
                  severity: a.severity,
                  why: a.why,
                }))
              );
            } catch {
              /* ignore */
            }
          }
          if (ed.ok) {
            try {
              const ej = await ed.json();
              if (ej?.row) {
                setEvidenceD({
                  bucket: ej.row.bucket,
                  score0to100: ej.row.score0to100,
                  reasons: ej.row.reasons ?? [],
                  sectionWithSources: ej.row.sectionWithSources,
                  sectionTotal: ej.row.sectionTotal,
                  rawSourceCount: ej.row.rawSourceCount,
                });
              }
            } catch (e) {
              console.error("[wiki] evidence-density JSON parse failed:", e);
            }
          }
          if (hr.ok) {
            try {
              const hj = await hr.json();
              if (hj?.row) {
                setHumanR({ badge: hj.row.badge, staleAfterEdit: !!hj.row.staleAfterEdit });
              }
            } catch (e) {
              console.error("[wiki] human-review JSON parse failed:", e);
            }
          }
          if (ch.ok) {
            try {
              const cj = await ch.json();
              if (cj?.trend) {
                setConfHist({
                  trend: cj.trend,
                  current: cj.current,
                  recentDelta: cj.recentDelta,
                  sparkline: Array.isArray(cj.sparkline) ? cj.sparkline : [],
                });
              }
            } catch (e) {
              console.error("[wiki] confidence-history JSON parse failed:", e);
            }
          }
        }
      } catch (e) {
        if (signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
        console.error("[wiki] load failed:", e);
        setData({ error: "Could not load wiki." });
        setTree([]);
      }
    })();

    return () => controller.abort();
  }, [path]);

  useEffect(() => {
    if (!trace?.sections?.length || !traceSectionQ) return;
    if (trace.sections.some((s) => s.id === traceSectionQ)) {
      setSelTrace(traceSectionQ);
    }
  }, [trace, traceSectionQ]);

  useEffect(() => {
    if (panelQ !== "trace" || !tracePanelRef.current) return;
    tracePanelRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [panelQ, path, trace]);

  if (data?.error) {
    return <p className="text-red-600">{data.error}</p>;
  }
  if (!data) return <p className="text-[var(--muted)]">Loading…</p>;

  const obsidian =
    data.obsidianOpenUrl ??
    `obsidian://open?vault=${encodeURIComponent(data.vaultName ?? "SecondBrain")}&file=${encodeURIComponent(path)}`;

  const fm = data.frontmatter ?? {};
  const editPolicy = (fm.wiki_edit_policy as string | undefined) ?? "open";
  const lockHint =
    editPolicy === "locked"
      ? "Locked — ingest writes proposals under .brain/proposed-wiki-updates/"
      : editPolicy === "manual_review"
        ? "Manual review — ingest proposes patches instead of silent merge"
        : null;

  const selected = trace?.sections?.find((s) => s.id === selTrace) ?? trace?.sections?.[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(180px,240px)_minmax(0,1fr)_minmax(0,280px)]">
      <WikiSidebar files={tree} currentPath={path} />
      <article className="prose max-w-none prose-headings:text-[var(--foreground)] prose-a:text-blue-600">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.content ?? ""}</ReactMarkdown>
      </article>
      <aside className="space-y-4 text-sm">
        <div>
          <div className="text-xs uppercase text-[var(--muted)]">Path</div>
          <div className="break-all font-mono text-xs text-[var(--accent)]">{path}</div>
        </div>
        {freshness ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--card)]/50 p-3">
            <div className="text-xs uppercase text-[var(--muted)]">Freshness</div>
            <div className="mt-1 font-medium capitalize text-[var(--foreground)]">{freshness.category}</div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{freshness.explain}</p>
          </div>
        ) : null}
        {lockHint ? (
          <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-xs text-amber-800">
            <span className="font-semibold">Canonical guard</span>
            <p className="mt-1 text-amber-700">{lockHint}</p>
          </div>
        ) : null}
        {humanR ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--card)]/50 p-3">
            <div className="text-xs uppercase text-[var(--muted)]">Human review badge</div>
            <div className="mt-1 font-medium capitalize text-[var(--foreground)]">{humanR.badge.replace(/-/g, " ")}</div>
            {humanR.staleAfterEdit ? (
              <p className="mt-1 text-xs text-amber-700">File changed after last human_reviewed_at — consider re-review.</p>
            ) : (
              <p className="mt-1 text-xs text-[var(--muted)]">From frontmatter + `.brain/human-review.json` after refresh.</p>
            )}
          </div>
        ) : null}
        {evidenceD ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--card)]/50 p-3">
            <div className="text-xs uppercase text-[var(--muted)]">Evidence density (support depth)</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="font-medium capitalize text-[var(--foreground)]">{evidenceD.bucket}</span>
              <span className="text-xs text-[var(--muted)]">{evidenceD.score0to100}/100</span>
            </div>
            <p className="mt-1 text-[10px] text-zinc-500">
              Sections with sources: {evidenceD.sectionWithSources}/{evidenceD.sectionTotal || "?"} · raw links:{" "}
              {evidenceD.rawSourceCount}
            </p>
            <p className="mt-2 text-xs font-medium text-[var(--muted)]">Why this density?</p>
            <ul className="mt-1 max-h-32 list-inside list-disc text-xs text-[var(--muted)]">
              {evidenceD.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <Link href="/source-trace" className="mt-2 inline-block text-[10px] text-sky-400">
              Source trace
            </Link>
          </div>
        ) : null}
        {confHist && path.startsWith("wiki/") ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--card)]/50 p-3">
            <div className="text-xs uppercase text-[var(--muted)]">Confidence delta (advisory)</div>
            <div className="mt-1 font-medium capitalize text-[var(--foreground)]">{confHist.trend}</div>
            {confHist.current ? (
              <p className="mt-1 text-xs text-[var(--muted)]">
                Composite ~{confHist.current.composite0to100}/100 · last sample{" "}
                {confHist.current.at.slice(0, 10)}
                {typeof confHist.recentDelta === "number" ? (
                  <span className="text-sky-300/90"> · Δ {confHist.recentDelta > 0 ? "+" : ""}{confHist.recentDelta}</span>
                ) : null}
              </p>
            ) : (
              <p className="mt-1 text-xs text-[var(--muted)]">Not enough history yet — run refreshes over time.</p>
            )}
            {confHist.sparkline.length > 1 ? (
              <p className="mt-2 font-mono text-[10px] text-zinc-500">
                {confHist.sparkline.map((v, i) => (
                  <span key={i} title={`${v}`}>
                    {v}
                    {i < confHist.sparkline.length - 1 ? " → " : ""}
                  </span>
                ))}
              </p>
            ) : null}
            <p className="mt-2 text-[10px] text-zinc-500">
              From <code className="text-[var(--accent)]">.brain/confidence-history.json</code> — heuristic composite, not truth.
            </p>
          </div>
        ) : null}
        {pageQ ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--card)]/50 p-3">
            <div className="text-xs uppercase text-[var(--muted)]">Page quality (heuristic)</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="font-medium capitalize text-[var(--foreground)]">{pageQ.bucket}</span>
              <span className="text-xs text-[var(--muted)]">{pageQ.score0to100}/100</span>
            </div>
            <p className="mt-2 text-xs font-medium text-[var(--muted)]">Why this score?</p>
            <ul className="mt-1 max-h-40 list-inside list-disc space-y-0.5 overflow-auto text-xs text-[var(--muted)]">
              {pageQ.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-zinc-500">
              From <code className="text-[var(--accent)]">.brain/page-quality.json</code> after{" "}
              <Link href="/operations" className="text-sky-500">
                operational refresh
              </Link>
              . Signals are triage hints, not grades of truth.
            </p>
          </div>
        ) : path.startsWith("wiki/") ? (
          <p className="text-xs text-[var(--muted)]">
            No page quality row yet — run{" "}
            <Link href="/operations" className="text-sky-400">
              operational refresh
            </Link>
            .
          </p>
        ) : null}
        {evidenceAlerts.length ? (
          <div className="rounded-md border border-amber-400 bg-amber-50 p-3">
            <div className="text-xs uppercase text-[var(--muted)]">Evidence change (recent)</div>
            <ul className="mt-2 space-y-2 text-xs text-[var(--muted)]">
              {evidenceAlerts.map((a) => (
                <li key={a.id}>
                  <span className="font-medium text-amber-700">{a.severity}</span>: {a.changeSummary}
                  {a.why ? <span className="block text-[10px] text-zinc-500">{a.why}</span> : null}
                </li>
              ))}
            </ul>
            <Link href="/governance" className="mt-2 inline-block text-[10px] text-sky-400">
              Governance hub
            </Link>
          </div>
        ) : null}
        <div className="text-xs text-[var(--muted)]">
          Vault:{" "}
          <span className="font-mono text-[var(--accent)]">{data.vaultName ?? "—"}</span>
          {data.vaultNameSource ? (
            <span className="text-[var(--muted)]"> ({data.vaultNameSource})</span>
          ) : null}
        </div>
        <a
          href={obsidian}
          className="block rounded-md border border-[var(--border)] px-3 py-2 text-center hover:border-sky-500"
        >
          Open in Obsidian
        </a>
        {data.wikilinks?.length ? (
          <div>
            <div className="text-xs uppercase text-[var(--muted)]">Wikilinks</div>
            <ul className="mt-2 space-y-1">
              {data.wikilinks.map((l) => (
                <li key={l}>
                  <a
                    href={`/wiki?path=${encodeURIComponent(`wiki/topics/${l}.md`)}`}
                    className="text-sky-400 hover:underline"
                  >
                    [[{l}]]
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {trace?.sections?.length ? (
          <div
            ref={tracePanelRef}
            id="wiki-claim-trace-panel"
            className="rounded-md border border-[var(--border)] bg-[var(--card)]/40 p-3"
          >
            <div className="text-xs uppercase text-[var(--muted)]">Claim trace</div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Section-level provenance (ingest). <strong>{selected?.support}</strong> support.
            </p>
            <select
              className="mt-2 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
              value={selTrace ?? trace.sections[0]!.id}
              onChange={(e) => setSelTrace(e.target.value)}
            >
              {trace.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.heading}
                </option>
              ))}
            </select>
            {selected ? (
              <div className="mt-2 space-y-2 text-xs">
                {selected.notes ? (
                  <p className="text-amber-700">{selected.notes}</p>
                ) : null}
                <div className="text-[var(--muted)]">Raw sources</div>
                <ul className="max-h-32 space-y-1 overflow-auto font-mono text-[var(--accent)]">
                  {selected.sources.map((s) => (
                    <li key={s.path}>{s.path}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : path.startsWith("wiki/") ? (
          <p className="text-xs text-[var(--muted)]">
            No trace sidecar yet — run <code className="text-[var(--accent)]">brain ingest</code> after editing frontmatter
            with <code className="text-[var(--accent)]">sources</code>.
          </p>
        ) : null}
        {path.startsWith("wiki/") ? (
          <div className="space-y-2 border-t border-[var(--border)]/60 pt-3">
            <div className="text-xs uppercase text-[var(--muted)]">Governance actions</div>
            <button
              type="button"
              disabled={humanReviewLoading || snapshotLoading}
              className="w-full rounded border border-[var(--border)] py-1.5 text-xs text-blue-600 hover:bg-[var(--ring)]/30 disabled:opacity-50"
              onClick={async () => {
                setGovActionMsg(null);
                setHumanReviewLoading(true);
                try {
                  const post = await fetch("/api/human-review", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path, by: "dashboard" }),
                  });
                  let errText = !post.ok ? "Request failed" : "";
                  try {
                    const pj = (await post.json()) as { error?: string };
                    if (!post.ok) errText = pj.error ?? `HTTP ${post.status}`;
                  } catch {
                    if (!post.ok) errText = `HTTP ${post.status}`;
                  }
                  if (!post.ok) {
                    setGovActionMsg({ text: errText, error: true });
                    return;
                  }
                  const r = await fetch(`/api/human-review?path=${encodeURIComponent(path)}`);
                  if (!r.ok) {
                    setGovActionMsg({ text: `Refresh failed (HTTP ${r.status})`, error: true });
                    return;
                  }
                  const hj = (await r.json()) as { row?: { badge: string; staleAfterEdit?: boolean } };
                  if (hj.row) {
                    setHumanR({ badge: hj.row.badge, staleAfterEdit: !!hj.row.staleAfterEdit });
                    setGovActionMsg({ text: "Marked human-reviewed.", error: false });
                  } else {
                    setGovActionMsg({ text: "Updated; no row returned.", error: false });
                  }
                } catch (e) {
                  setGovActionMsg({
                    text: e instanceof Error ? e.message : "Network error",
                    error: true,
                  });
                } finally {
                  setHumanReviewLoading(false);
                }
              }}
            >
              {humanReviewLoading ? "Saving…" : "Mark human-reviewed"}
            </button>
            <button
              type="button"
              disabled={snapshotLoading || humanReviewLoading}
              className="w-full rounded border border-[var(--border)] py-1.5 text-xs text-zinc-600 hover:bg-[var(--ring)]/30 disabled:opacity-50"
              onClick={async () => {
                setGovActionMsg(null);
                setSnapshotLoading(true);
                try {
                  const res = await fetch("/api/wiki-snapshot", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path, reason: "wiki-ui-manual" }),
                  });
                  let message = "";
                  try {
                    const j = (await res.json()) as { error?: string; ok?: boolean };
                    if (!res.ok) {
                      message = j.error ?? `HTTP ${res.status}`;
                      setGovActionMsg({ text: message, error: true });
                      return;
                    }
                    message = j.ok === true ? "Snapshot saved." : "Snapshot completed.";
                    setGovActionMsg({ text: message, error: false });
                  } catch {
                    setGovActionMsg({
                      text: res.ok ? "Snapshot completed (unreadable response)." : `HTTP ${res.status}`,
                      error: !res.ok,
                    });
                  }
                } catch (e) {
                  setGovActionMsg({
                    text: e instanceof Error ? e.message : "Network error",
                    error: true,
                  });
                } finally {
                  setSnapshotLoading(false);
                }
              }}
            >
              {snapshotLoading ? "Snapshotting…" : "Snapshot page copy"}
            </button>
            {govActionMsg ? (
              <p
                className={
                  govActionMsg.error ? "text-xs text-red-600" : "text-xs text-emerald-700"
                }
              >
                {govActionMsg.text}
              </p>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

export default function WikiPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Wiki</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Browse from the sidebar; INDEX and dashboard are highlighted.
          </p>
        </div>
      </header>
      <Suspense fallback={<p className="text-[var(--muted)]">Loading…</p>}>
        <WikiBody />
      </Suspense>
    </div>
  );
}

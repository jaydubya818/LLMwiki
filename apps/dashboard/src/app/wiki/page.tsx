"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { WikiSidebar } from "@/components/WikiSidebar";

// ─── types ───────────────────────────────────────────────────────────────────

type TraceSection = {
  id: string;
  heading: string;
  support: string;
  sources: { path: string; lastIngestedAt?: string }[];
  notes?: string;
};

// ─── TOC helpers ─────────────────────────────────────────────────────────────

type Heading = { level: number; text: string; id: string };

function extractHeadings(md: string): Heading[] {
  const results: Heading[] = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^(#{1,4})\s+(.+)$/);
    if (m) {
      const text = m[2].replace(/[*_`[\]]/g, "").trim();
      const id   = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      results.push({ level: m[1].length, text, id });
    }
  }
  return results;
}

// Custom heading components that add id anchors for TOC links
function makeH(Tag: "h1" | "h2" | "h3" | "h4") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function HeadingComp({ children, ...props }: any) {
    const text = String(children).replace(/[*_`[\]]/g, "").trim();
    const id   = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return <Tag id={id} {...props}>{children}</Tag>;
  };
}
const mdComponents = { h1: makeH("h1"), h2: makeH("h2"), h3: makeH("h3"), h4: makeH("h4") };

// ─── TOC panel ───────────────────────────────────────────────────────────────

function TableOfContents({ content, obsidianUrl, path }: {
  content: string;
  obsidianUrl: string;
  path: string;
}) {
  const headings = extractHeadings(content);
  const [active, setActive] = useState<string>("");

  // Scroll spy
  useEffect(() => {
    if (!headings.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [content]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sticky top-8 space-y-6">
      {headings.length > 0 && (
        <div>
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
            On this page
          </div>
          <nav className="space-y-0.5">
            {headings.map((h, i) => (
              <a
                key={i}
                href={`#${h.id}`}
                className={`block truncate text-xs leading-relaxed transition ${
                  h.level >= 3 ? "pl-4" : h.level === 2 ? "pl-2" : ""
                } ${
                  active === h.id
                    ? "font-medium text-[var(--foreground)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {h.text}
              </a>
            ))}
          </nav>
        </div>
      )}

      {/* Open in Obsidian */}
      {path.startsWith("wiki/") && (
        <a
          href={obsidianUrl}
          className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:border-gray-300 hover:text-[var(--foreground)]"
        >
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open in Obsidian
        </a>
      )}
    </div>
  );
}

// ─── governance details (collapsible) ────────────────────────────────────────

function GovernancePanel({
  path, freshness, pageQ, evidenceD, humanR, confHist, evidenceAlerts,
  humanReviewLoading, snapshotLoading, govActionMsg,
  onMarkReviewed, onSnapshot,
}: {
  path: string;
  freshness: { category: string; explain: string } | null;
  pageQ: { bucket: string; score0to100: number; reasons: string[] } | null;
  evidenceD: { bucket: string; score0to100: number; reasons: string[]; sectionWithSources: number; sectionTotal: number; rawSourceCount: number } | null;
  humanR: { badge: string; staleAfterEdit: boolean } | null;
  confHist: { trend: string; current?: { composite0to100: number; at: string }; recentDelta?: number; sparkline: number[] } | null;
  evidenceAlerts: { id: string; changeSummary: string; severity: string; why: string }[];
  humanReviewLoading: boolean;
  snapshotLoading: boolean;
  govActionMsg: { text: string; error: boolean } | null;
  onMarkReviewed: () => void;
  onSnapshot: () => void;
}) {
  return (
    <details className="mt-6">
      <summary className="cursor-pointer select-none text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)] hover:text-[var(--foreground)] [&::-webkit-details-marker]:hidden">
        Page details ›
      </summary>
      <div className="mt-3 space-y-3 text-xs">
        {freshness && (
          <div className="rounded border border-[var(--border)] bg-[var(--card)] p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Freshness</div>
            <div className="mt-0.5 font-medium capitalize text-[var(--foreground)]">{freshness.category}</div>
            <p className="mt-1 text-[var(--muted)]">{freshness.explain}</p>
          </div>
        )}
        {humanR && (
          <div className="rounded border border-[var(--border)] bg-[var(--card)] p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Human review</div>
            <div className="mt-0.5 font-medium capitalize">{humanR.badge.replace(/-/g, " ")}</div>
            {humanR.staleAfterEdit && <p className="mt-1 text-amber-700">File changed after last review.</p>}
          </div>
        )}
        {evidenceD && (
          <div className="rounded border border-[var(--border)] bg-[var(--card)] p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Evidence density</div>
            <div className="mt-0.5 font-medium capitalize">{evidenceD.bucket} · {evidenceD.score0to100}/100</div>
            <p className="mt-1 text-[var(--muted)]">{evidenceD.sectionWithSources}/{evidenceD.sectionTotal || "?"} sections sourced</p>
          </div>
        )}
        {confHist?.current && (
          <div className="rounded border border-[var(--border)] bg-[var(--card)] p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Confidence</div>
            <div className="mt-0.5 font-medium capitalize">{confHist.trend} · {confHist.current.composite0to100}/100</div>
          </div>
        )}
        {pageQ && (
          <div className="rounded border border-[var(--border)] bg-[var(--card)] p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Page quality</div>
            <div className="mt-0.5 font-medium capitalize">{pageQ.bucket} · {pageQ.score0to100}/100</div>
          </div>
        )}
        {evidenceAlerts.length > 0 && (
          <div className="rounded border border-amber-400 bg-amber-50 p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-amber-700">Evidence alerts</div>
            {evidenceAlerts.map((a) => (
              <div key={a.id} className="mt-1 text-amber-800">
                <span className="font-medium">{a.severity}</span>: {a.changeSummary}
              </div>
            ))}
          </div>
        )}
        {path.startsWith("wiki/") && (
          <div className="space-y-1.5 pt-1">
            <button
              type="button"
              disabled={humanReviewLoading || snapshotLoading}
              onClick={onMarkReviewed}
              className="w-full rounded border border-[var(--border)] py-1.5 text-blue-600 transition hover:bg-blue-50 disabled:opacity-50"
            >
              {humanReviewLoading ? "Saving…" : "Mark human-reviewed"}
            </button>
            <button
              type="button"
              disabled={snapshotLoading || humanReviewLoading}
              onClick={onSnapshot}
              className="w-full rounded border border-[var(--border)] py-1.5 text-[var(--muted)] transition hover:bg-[var(--ring)]/30 disabled:opacity-50"
            >
              {snapshotLoading ? "Snapshotting…" : "Snapshot page copy"}
            </button>
            {govActionMsg && (
              <p className={govActionMsg.error ? "text-red-600" : "text-emerald-700"}>
                {govActionMsg.text}
              </p>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

// ─── main wiki body ───────────────────────────────────────────────────────────

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
  const [freshness, setFreshness]   = useState<{ category: string; explain: string } | null>(null);
  const [trace, setTrace]           = useState<{ sections: TraceSection[] } | null>(null);
  const [selTrace, setSelTrace]     = useState<string | null>(null);
  const [pageQ, setPageQ]           = useState<{ bucket: string; score0to100: number; reasons: string[] } | null>(null);
  const [evidenceAlerts, setEvidenceAlerts] = useState<{ id: string; changeSummary: string; severity: string; why: string }[]>([]);
  const [evidenceD, setEvidenceD]   = useState<{ bucket: string; score0to100: number; reasons: string[]; sectionWithSources: number; sectionTotal: number; rawSourceCount: number } | null>(null);
  const [humanR, setHumanR]         = useState<{ badge: string; staleAfterEdit: boolean } | null>(null);
  const [humanReviewLoading, setHumanReviewLoading] = useState(false);
  const [snapshotLoading, setSnapshotLoading]       = useState(false);
  const [govActionMsg, setGovActionMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [confHist, setConfHist]     = useState<{ trend: string; current?: { composite0to100: number; at: string }; recentDelta?: number; sparkline: number[] } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setData(null); setFreshness(null); setTrace(null); setSelTrace(null);
    setPageQ(null); setEvidenceAlerts([]); setEvidenceD(null); setHumanR(null); setConfHist(null);

    void (async () => {
      try {
        const [wikiR, treeR] = await Promise.all([
          fetch(`/api/wiki?path=${encodeURIComponent(path)}`, { signal }),
          fetch("/api/wiki-tree", { signal }),
        ]);
        if (signal.aborted) return;

        if (!wikiR.ok) {
          setData({ error: `Could not load page (HTTP ${wikiR.status}).` });
        } else {
          try { setData(await wikiR.json()); } catch { setData({ error: "Invalid response." }); }
        }

        if (treeR.ok) {
          try {
            const t = await treeR.json();
            setTree(Array.isArray(t.files) ? t.files : []);
          } catch { setTree([]); }
        }

        if (signal.aborted || !path.startsWith("wiki/")) return;

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

        if (fr.ok) { try { const j = await fr.json(); if (j?.freshness) setFreshness(j.freshness); } catch {} }
        if (tr.ok) { try { const j = await tr.json(); if (j?.trace?.sections?.length) setTrace(j.trace); } catch {} }
        if (pq.ok) {
          try {
            const j = await pq.json();
            if (j?.row) setPageQ({ bucket: j.row.bucket, score0to100: j.row.score0to100, reasons: j.row.reasons ?? [] });
          } catch {}
        }
        if (gov.ok) {
          try {
            const gj = await gov.json() as { evidenceAlerts?: { alerts?: { id: string; pagePath: string; changeSummary: string; severity: string; why: string; status: string }[] } };
            const alerts = (gj.evidenceAlerts?.alerts ?? []).filter((a) => a.pagePath === path && a.status === "new");
            setEvidenceAlerts(alerts.slice(0, 6).map((a) => ({ id: a.id, changeSummary: a.changeSummary, severity: a.severity, why: a.why })));
          } catch {}
        }
        if (ed.ok) {
          try {
            const j = await ed.json();
            if (j?.row) setEvidenceD({ bucket: j.row.bucket, score0to100: j.row.score0to100, reasons: j.row.reasons ?? [], sectionWithSources: j.row.sectionWithSources, sectionTotal: j.row.sectionTotal, rawSourceCount: j.row.rawSourceCount });
          } catch {}
        }
        if (hr.ok) {
          try { const j = await hr.json(); if (j?.row) setHumanR({ badge: j.row.badge, staleAfterEdit: !!j.row.staleAfterEdit }); } catch {}
        }
        if (ch.ok) {
          try {
            const j = await ch.json();
            if (j?.trend) setConfHist({ trend: j.trend, current: j.current, recentDelta: j.recentDelta, sparkline: Array.isArray(j.sparkline) ? j.sparkline : [] });
          } catch {}
        }
      } catch (e) {
        if (signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
        setData({ error: "Could not load wiki." });
        setTree([]);
      }
    })();
    return () => controller.abort();
  }, [path]);

  useEffect(() => {
    if (!trace?.sections?.length || !traceSectionQ) return;
    if (trace.sections.some((s) => s.id === traceSectionQ)) setSelTrace(traceSectionQ);
  }, [trace, traceSectionQ]);

  useEffect(() => {
    if (panelQ !== "trace" || !tracePanelRef.current) return;
    tracePanelRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [panelQ, path, trace]);

  const obsidian =
    data?.obsidianOpenUrl ??
    `obsidian://open?vault=${encodeURIComponent(data?.vaultName ?? "SecondBrain")}&file=${encodeURIComponent(path)}`;

  const fm = data?.frontmatter ?? {};
  const editPolicy = (fm.wiki_edit_policy as string | undefined) ?? "open";
  const lockHint =
    editPolicy === "locked"
      ? "Locked — ingest writes proposals under .brain/proposed-wiki-updates/"
      : editPolicy === "manual_review"
        ? "Manual review — ingest proposes patches instead of silent merge"
        : null;

  // ── async actions ──────────────────────────────────────────────────────────

  async function markReviewed() {
    setGovActionMsg(null);
    setHumanReviewLoading(true);
    try {
      const res = await fetch("/api/human-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, by: "dashboard" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        setGovActionMsg({ text: j.error ?? `HTTP ${res.status}`, error: true });
        return;
      }
      const r = await fetch(`/api/human-review?path=${encodeURIComponent(path)}`);
      const hj = await r.json() as { row?: { badge: string; staleAfterEdit?: boolean } };
      if (hj.row) { setHumanR({ badge: hj.row.badge, staleAfterEdit: !!hj.row.staleAfterEdit }); }
      setGovActionMsg({ text: "Marked human-reviewed.", error: false });
    } catch (e) {
      setGovActionMsg({ text: e instanceof Error ? e.message : "Network error", error: true });
    } finally { setHumanReviewLoading(false); }
  }

  async function takeSnapshot() {
    setGovActionMsg(null);
    setSnapshotLoading(true);
    try {
      const res = await fetch("/api/wiki-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, reason: "wiki-ui-manual" }),
      });
      const j = await res.json().catch(() => ({})) as { error?: string; ok?: boolean };
      if (!res.ok) { setGovActionMsg({ text: j.error ?? `HTTP ${res.status}`, error: true }); return; }
      setGovActionMsg({ text: "Snapshot saved.", error: false });
    } catch (e) {
      setGovActionMsg({ text: e instanceof Error ? e.message : "Network error", error: true });
    } finally { setSnapshotLoading(false); }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-white">

      {/* ── LEFT: wiki file tree sidebar ──────────────────────────────────── */}
      <WikiSidebar
        files={tree}
        currentPath={path}
        vaultName={data?.vaultName}
        wikilinks={data?.wikilinks}
      />

      {/* ── CENTER + RIGHT ────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── CENTER: article ───────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-10 py-10">

            {/* loading / error */}
            {!data && <p className="text-[var(--muted)]">Loading…</p>}
            {data?.error && <p className="text-red-600">{data.error}</p>}

            {/* lock hint banner */}
            {lockHint && data && !data.error && (
              <div className="mb-6 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span className="font-semibold">Canonical guard · </span>{lockHint}
              </div>
            )}

            {/* article content */}
            {data && !data.error && (
              <article className="prose max-w-none prose-headings:scroll-mt-6 prose-headings:text-[var(--foreground)] prose-a:text-blue-600 prose-code:rounded prose-code:bg-gray-100 prose-code:px-1 prose-code:text-sm prose-pre:bg-gray-100 prose-pre:text-sm">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={mdComponents}
                >
                  {data.content ?? ""}
                </ReactMarkdown>
              </article>
            )}

            {/* claim trace (advanced, below article) */}
            {trace?.sections?.length && path.startsWith("wiki/") ? (
              <div
                ref={tracePanelRef}
                className="mt-10 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-sm"
              >
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Claim trace</div>
                <select
                  className="w-full rounded border border-[var(--border)] bg-white px-2 py-1 text-xs"
                  value={selTrace ?? trace.sections[0]!.id}
                  onChange={(e) => setSelTrace(e.target.value)}
                >
                  {trace.sections.map((s) => (
                    <option key={s.id} value={s.id}>{s.heading}</option>
                  ))}
                </select>
                {(() => {
                  const sel = trace.sections.find((s) => s.id === selTrace) ?? trace.sections[0];
                  if (!sel) return null;
                  return (
                    <div className="mt-3 space-y-2 text-xs">
                      {sel.notes && <p className="text-amber-700">{sel.notes}</p>}
                      <p className="font-medium text-[var(--muted)]">Support: {sel.support}</p>
                      <ul className="max-h-32 space-y-0.5 overflow-auto font-mono text-[var(--accent)]">
                        {sel.sources.map((s) => <li key={s.path}>{s.path}</li>)}
                      </ul>
                    </div>
                  );
                })()}
              </div>
            ) : null}

          </div>
        </main>

        {/* ── RIGHT: TOC + page details ─────────────────────────────────── */}
        <aside className="w-52 shrink-0 overflow-y-auto border-l border-[var(--border)] px-5 py-8">
          {data && !data.error && (
            <>
              <TableOfContents
                content={data.content ?? ""}
                obsidianUrl={obsidian}
                path={path}
              />
              <GovernancePanel
                path={path}
                freshness={freshness}
                pageQ={pageQ}
                evidenceD={evidenceD}
                humanR={humanR}
                confHist={confHist}
                evidenceAlerts={evidenceAlerts}
                humanReviewLoading={humanReviewLoading}
                snapshotLoading={snapshotLoading}
                govActionMsg={govActionMsg}
                onMarkReviewed={markReviewed}
                onSnapshot={takeSnapshot}
              />
            </>
          )}
          {!data && <p className="text-xs text-[var(--muted)]">Loading…</p>}
        </aside>

      </div>
    </div>
  );
}

// ─── page export ─────────────────────────────────────────────────────────────

export default function WikiPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-[var(--muted)]">
          Loading…
        </div>
      }
    >
      <WikiBody />
    </Suspense>
  );
}

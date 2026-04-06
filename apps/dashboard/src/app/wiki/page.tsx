"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { WikiSidebar } from "@/components/WikiSidebar";

function WikiBody() {
  const sp = useSearchParams();
  const path = sp.get("path") ?? "wiki/INDEX.md";
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

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setData(null);

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
      } catch (e) {
        if (signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
        console.error("[wiki] load failed:", e);
        setData({ error: "Could not load wiki." });
        setTree([]);
      }
    })();

    return () => controller.abort();
  }, [path]);

  if (data?.error) {
    return <p className="text-red-400">{data.error}</p>;
  }
  if (!data) return <p className="text-[var(--muted)]">Loading…</p>;

  const obsidian =
    data.obsidianOpenUrl ??
    `obsidian://open?vault=${encodeURIComponent(data.vaultName ?? "SecondBrain")}&file=${encodeURIComponent(path)}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(180px,240px)_minmax(0,1fr)_minmax(0,200px)]">
      <WikiSidebar files={tree} currentPath={path} />
      <article className="prose prose-invert max-w-none prose-headings:text-[var(--foreground)] prose-a:text-sky-400">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.content ?? ""}</ReactMarkdown>
      </article>
      <aside className="space-y-4 text-sm">
        <div>
          <div className="text-xs uppercase text-[var(--muted)]">Path</div>
          <div className="break-all font-mono text-xs text-[var(--accent)]">{path}</div>
        </div>
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

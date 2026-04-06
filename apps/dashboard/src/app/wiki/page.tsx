"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function WikiBody() {
  const sp = useSearchParams();
  const path = sp.get("path") ?? "wiki/INDEX.md";
  const [data, setData] = useState<{
    content?: string;
    frontmatter?: Record<string, unknown>;
    wikilinks?: string[];
    error?: string;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await fetch(`/api/wiki?path=${encodeURIComponent(path)}`);
      const j = await r.json();
      setData(j);
    })();
  }, [path]);

  if (data?.error) {
    return <p className="text-red-400">{data.error}</p>;
  }
  if (!data) return <p className="text-[var(--muted)]">Loading…</p>;

  const vault = "SecondBrain";
  const obsidian = `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path)}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_220px]">
      <article className="prose prose-invert max-w-none prose-headings:text-[var(--foreground)] prose-a:text-sky-400">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.content ?? ""}</ReactMarkdown>
      </article>
      <aside className="space-y-4 text-sm">
        <div>
          <div className="text-xs uppercase text-[var(--muted)]">Path</div>
          <div className="font-mono text-xs break-all text-[var(--accent)]">{path}</div>
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
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">Wiki</h1>
      <Suspense fallback={<p className="text-[var(--muted)]">Loading…</p>}>
        <WikiBody />
      </Suspense>
    </div>
  );
}

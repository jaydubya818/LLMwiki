"use client";

import { useEffect, useState } from "react";

export default function VideoPage() {
  const [data, setData] = useState<{
    daily?: string;
    latestScript?: string;
    latestName?: string;
    heygen?: string;
  }>({});

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/video");
      setData(await r.json());
    })();
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Daily video</h1>
      <p className="text-sm text-[var(--muted)]">
        HeyGen: <span className="text-[var(--accent)]">{data.heygen}</span>
      </p>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase text-[var(--muted)]">
          Latest script ({data.latestName})
        </h2>
        <pre className="max-h-80 overflow-auto rounded-lg border border-[var(--border)] bg-black/40 p-4 text-sm whitespace-pre-wrap">
          {data.latestScript || "—"}
        </pre>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase text-[var(--muted)]">
          daily_videos.md tail
        </h2>
        <pre className="max-h-80 overflow-auto rounded-lg border border-[var(--border)] bg-black/40 p-4 text-xs whitespace-pre-wrap">
          {data.daily || "—"}
        </pre>
      </section>
    </div>
  );
}

"use client";

import BrainGraph from "@/components/BrainGraph";

export default function GraphPage() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Knowledge graph</h1>
        <p className="text-sm text-[var(--muted)]">
          Hubs show stronger out-links; orphan styling highlights weak inbound links.
        </p>
      </div>
      <BrainGraph />
    </div>
  );
}

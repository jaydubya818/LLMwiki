import { Suspense } from "react";
import { DiffReviewClient } from "@/components/DiffReviewClient";

export default function DiffPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl p-8 text-sm text-[var(--muted)]">Loading diff…</div>
      }
    >
      <DiffReviewClient />
    </Suspense>
  );
}

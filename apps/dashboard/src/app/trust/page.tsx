import Link from "next/link";

const cards = [
  {
    href: "/operations",
    title: "Operations & intelligence (v2)",
    body: "Unsupported claims, conflicts, drift, open loops, page quality, review queue, heatmap, relationship hubs, and executive snapshot — all file-backed under .brain/.",
  },
  {
    href: "/governance",
    title: "Governance & review (v2/v3)",
    body: "Canon promotion workflow, review SLA hints, decision impact map, steward digests, evidence change alerts, snapshot bundles, resolution quality, canon drift watchlist, review session mode, quarterly review — local JSON + markdown outputs.",
  },
  {
    href: "/wiki",
    title: "Claim trace",
    body: "Open any wiki page: inspect section-level support, sources, and synthesis vs direct cues in the right-hand panel.",
  },
  {
    href: "/promotion-inbox",
    title: "Promotion inbox",
    body: "Stage outputs and artifacts before they merge into canonical wiki pages. Approve, defer, or promote with lineage preserved.",
  },
  {
    href: "/coverage",
    title: "Coverage gaps & scorecards",
    body: "See where raw capture outpaces wiki synthesis and scan domain health bands (completeness, freshness, linkage).",
  },
  {
    href: "/decisions",
    title: "Decision ledger",
    body: "Searchable index of decision-shaped pages plus `.brain/decision-ledger.json` and `wiki/decisions/INDEX.md`.",
  },
  {
    href: "/decision-draft",
    title: "Decision draft from source",
    body: "Preview then confirm a `wiki/decisions/` stub from a raw or output note. Stubs stay out of the ledger until `include_in_ledger: true`.",
  },
  {
    href: "/runs",
    title: "Run replay",
    body: "Every ingest / output / ask run records changed files, inputs, and trust notes. Open a run for the full JSON replay.",
  },
  {
    href: "/compare",
    title: "Comparative synthesis",
    body: "Pick 2–4 wiki pages and generate a structured compare/contrast markdown file under outputs/comparisons/.",
  },
];

export default function TrustHubPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Trust &amp; curation</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          Local-first explainability: provenance sidecars, freshness heuristics, canonical locks, promotion workflow, and
          auditable runs. Nothing here implies certainty — signals help you steer durable knowledge deliberately.
        </p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className="block h-full rounded-lg border border-[var(--border)] bg-[var(--card)]/70 p-4 transition hover:border-sky-500/50"
            >
              <div className="font-medium text-sky-400">{c.title}</div>
              <p className="mt-2 text-sm text-[var(--muted)]">{c.body}</p>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-[var(--muted)]">
        Prompt-to-output lineage: open any generated markdown under <code className="text-[var(--accent)]">outputs/</code>{" "}
        that includes <code className="text-[var(--accent)]">lineage_id</code>, or use{" "}
        <code className="text-[var(--accent)]">/api/lineage?output=…</code>.
      </p>
    </div>
  );
}

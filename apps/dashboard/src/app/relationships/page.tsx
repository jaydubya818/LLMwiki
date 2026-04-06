import Link from "next/link";

export default function RelationshipsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Relationship hub</h1>
      <p className="text-sm text-[var(--muted)]">
        Hub markdown is regenerated when you run <strong>Refresh operational intelligence</strong> from{" "}
        <Link href="/operations" className="text-sky-400">
          Operations
        </Link>
        . It reads <code className="text-[var(--accent)]">graph.json</code> and updates:
      </p>
      <ul className="list-inside list-disc space-y-2 text-sm text-[var(--muted)]">
        <li>
          <code className="text-[var(--accent)]">wiki/relationship-hub.md</code> — people, projects, decisions by hub
          score
        </li>
        <li>
          <code className="text-[var(--accent)]">wiki/people/INDEX.md</code> and{" "}
          <code className="text-[var(--accent)]">wiki/projects/INDEX.md</code> when those folders exist
        </li>
      </ul>
      <div className="flex flex-col gap-2 text-sm">
        <Link
          href="/wiki?path=wiki/relationship-hub.md"
          className="rounded-md border border-[var(--border)] px-4 py-3 text-center text-sky-400 hover:bg-[var(--ring)]/20"
        >
          Open relationship-hub.md
        </Link>
        <Link href="/graph" className="text-center text-xs text-[var(--muted)]">
          Or browse the interactive graph →
        </Link>
      </div>
    </div>
  );
}

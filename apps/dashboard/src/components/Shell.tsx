import Link from "next/link";

/** App shell: sidebar layout is brain-agnostic; a future brain/workspace switcher can live in this header row without restructuring routes. */
const links = [
  { href: "/", label: "Home" },
  { href: "/doctor", label: "Doctor" },
  { href: "/workspace", label: "Workspace" },
  { href: "/promotions", label: "Promotions" },
  { href: "/search", label: "Search" },
  { href: "/wiki", label: "Wiki" },
  { href: "/graph", label: "Graph" },
  { href: "/diff", label: "Diff" },
  { href: "/runs", label: "Runs" },
  { href: "/video", label: "Video" },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-52 shrink-0 border-r border-[var(--border)] bg-[var(--card)]/80 px-4 py-6 backdrop-blur">
        <div className="mb-8">
          <div className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
            Second Brain AI
          </div>
          <div className="mt-1 text-lg font-semibold text-[var(--foreground)]">
            Local Wiki
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-2 py-2 text-sm text-[var(--muted)] transition hover:bg-[var(--ring)]/40 hover:text-[var(--foreground)]"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="mt-8 text-xs leading-relaxed text-[var(--muted)]">
          Set <code className="text-[var(--accent)]">SECOND_BRAIN_WORKSPACE</code> (multi-brain) or{" "}
          <code className="text-[var(--accent)]">SECOND_BRAIN_ROOT</code> before{" "}
          <code className="text-[var(--accent)]">npm run dev</code>. Optional:{" "}
          <code className="text-[var(--accent)]">SECOND_BRAIN_NAME</code>,{" "}
          <code className="text-[var(--accent)]">SECOND_BRAIN_VAULT_NAME</code> (Obsidian links).
        </p>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}

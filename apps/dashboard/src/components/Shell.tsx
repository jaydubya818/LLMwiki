import Link from "next/link";

const primaryLinks = [
  { href: "/",        label: "Home",            desc: "Overview & quick actions" },
  { href: "/wiki",    label: "Browse Notes",    desc: "Read your wiki pages" },
  { href: "/search",  label: "Search",          desc: "Find anything" },
  { href: "/diff",    label: "Review Changes",  desc: "Approve or reject edits" },
  { href: "/graph",   label: "Knowledge Graph", desc: "See connections" },
  { href: "/doctor",  label: "Health Check",    desc: "System status" },
];

const advancedLinks = [
  { href: "/operations",      label: "Operations" },
  { href: "/executive",       label: "Executive view" },
  { href: "/executive-trust", label: "Trust score" },
  { href: "/canon-fragility", label: "Fragile pages" },
  { href: "/human-overrides", label: "My corrections" },
  { href: "/canon-admission", label: "Promote to wiki" },
  { href: "/decision-sunset", label: "Stale decisions" },
  { href: "/canon-council",   label: "Wiki council" },
  { href: "/strategic-themes",label: "Key themes" },
  { href: "/qoq-diff",        label: "Quarter review" },
  { href: "/governance",      label: "Governance tools" },
  { href: "/canonical-board", label: "Canonical board" },
  { href: "/steward",         label: "Steward" },
  { href: "/resolutions",     label: "Resolutions" },
  { href: "/trust",           label: "Trust & curation" },
  { href: "/promotion-inbox", label: "Promotion inbox" },
  { href: "/promotions",      label: "Agent promotions" },
  { href: "/runs",            label: "Run history" },
  { href: "/workspace",       label: "Workspace" },
  { href: "/video",           label: "Video" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-52 shrink-0 border-r border-[var(--border)] bg-[var(--card)]/80 px-3 py-6 backdrop-blur">
        {/* Brand */}
        <div className="mb-7 px-2">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
            Second Brain
          </div>
          <div className="mt-0.5 text-base font-semibold text-[var(--foreground)]">
            My Wiki
          </div>
        </div>

        {/* Primary nav */}
        <nav className="flex flex-col gap-0.5">
          {primaryLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group flex flex-col rounded-lg px-2 py-2 transition hover:bg-[var(--ring)]/40"
            >
              <span className="text-sm font-medium text-[var(--foreground)]">
                {l.label}
              </span>
              <span className="text-[10px] text-[var(--muted)] group-hover:text-[var(--foreground)]/70">
                {l.desc}
              </span>
            </Link>
          ))}
        </nav>

        {/* Advanced accordion (native HTML — no JS required) */}
        <details className="mt-5">
          <summary className="flex cursor-pointer select-none items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:bg-[var(--ring)]/30 hover:text-[var(--foreground)] [&::-webkit-details-marker]:hidden">
            <svg
              className="h-3 w-3 transition-transform [[open]_&]:rotate-90"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M6.293 7.293a1 1 0 011.414 0L10 9.586l2.293-2.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" />
            </svg>
            Advanced
          </summary>
          <nav className="mt-1 flex flex-col gap-0.5 pl-1">
            {advancedLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md px-2 py-1.5 text-xs text-[var(--muted)] transition hover:bg-[var(--ring)]/40 hover:text-[var(--foreground)]"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </details>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}

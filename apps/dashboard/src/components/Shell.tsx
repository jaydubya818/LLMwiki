"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const primaryLinks = [
  { href: "/wiki",   label: "Browse Notes",    desc: "Read your wiki pages" },
  { href: "/search", label: "Search",          desc: "Find anything" },
  { href: "/diff",   label: "Review Changes",  desc: "Approve or reject edits" },
  { href: "/graph",  label: "Knowledge Graph", desc: "See connections" },
  { href: "/doctor", label: "Health Check",    desc: "System status" },
  { href: "/",       label: "Dashboard",       desc: "Overview & quick actions" },
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
  const router = useRouter();
  const [q, setQ] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) {
      router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      setQ("");
    }
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-52 shrink-0 border-r border-[var(--border)] bg-[var(--card)] px-3 py-6">
        {/* Brand */}
        <div className="mb-5 px-2">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
            Second Brain
          </div>
          <div className="mt-0.5 text-base font-semibold text-[var(--foreground)]">
            My Wiki
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-5 px-1">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search notes…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-white py-1.5 pl-8 pr-3 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
        </form>

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

        {/* Advanced accordion */}
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

"use client";

import Link from "next/link";

export function WikiSidebar({
  files,
  currentPath,
}: {
  files: string[];
  currentPath: string;
}) {
  const sorted = [...files].sort((a, b) => a.localeCompare(b));

  return (
    <nav
      className="max-h-[calc(100vh-8rem)] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm"
      aria-label="Wiki pages"
    >
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Wiki
      </div>
      <ul className="space-y-0.5">
        {sorted.map((f) => {
          const short = f.replace(/^wiki\//, "");
          const isIdx =
            short === "INDEX.md" || short === "dashboard.md";
          const active = f === currentPath || (!currentPath && short === "INDEX.md");
          return (
            <li key={f}>
              <Link
                href={`/wiki?path=${encodeURIComponent(f)}`}
                className={`block rounded px-2 py-1 font-mono text-xs transition hover:bg-[var(--ring)]/30 ${
                  active
                    ? "bg-blue-100 text-blue-700 font-medium"
                    : isIdx
                      ? "text-amber-700 font-medium"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";

// ─── types ───────────────────────────────────────────────────────────────────

type FileNode   = { kind: "file";   name: string; path: string };
type FolderNode = { kind: "folder"; name: string; children: FileNode[] };
type TreeItem   = FileNode | FolderNode;

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildTree(files: string[]): TreeItem[] {
  const items: TreeItem[] = [];
  const folders: Record<string, FolderNode> = {};

  const wiki = [...files]
    .filter((f) => f.startsWith("wiki/"))
    .sort((a, b) => a.localeCompare(b));

  for (const file of wiki) {
    const rel = file.slice(5); // drop "wiki/"
    const sep = rel.indexOf("/");
    if (sep === -1) {
      items.push({ kind: "file", name: rel, path: file });
    } else {
      const folder = rel.slice(0, sep);
      const child  = rel.slice(sep + 1);
      if (!folders[folder]) {
        folders[folder] = { kind: "folder", name: folder, children: [] };
        items.push(folders[folder]);
      }
      folders[folder].children.push({ kind: "file", name: child, path: file });
    }
  }
  return items;
}

function displayName(raw: string): string {
  if (raw === "INDEX.md") return "Overview";
  return raw.replace(/\.md$/, "").replace(/[-_]/g, " ");
}

function folderLabel(raw: string): string {
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ─── icons ───────────────────────────────────────────────────────────────────

function PageIcon() {
  return (
    <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2.5" y="1.5" width="9" height="12" rx="1" />
      <path d="M5 5h6M5 7.5h6M5 10h4" strokeLinecap="round" />
    </svg>
  );
}

function SourceIcon({ color }: { color: string }) {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5">
      <rect x="2.5" y="1.5" width="9" height="12" rx="1" fill={color} fillOpacity="0.15" />
      <path d="M5 5h6M5 7.5h6M5 10h4" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg className="h-3 w-3 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4l4 4 4-4" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg className="h-3 w-3 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2l4 4-4 4" />
    </svg>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

// Source icon colors cycle
const SOURCE_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6"];

export function WikiSidebar({
  files,
  currentPath,
  vaultName,
  wikilinks,
}: {
  files: string[];
  currentPath: string;
  vaultName?: string;
  wikilinks?: string[];
}) {
  const tree = buildTree(files);
  const wikiCount = files.filter((f) => f.startsWith("wiki/")).length;

  // Auto-open folder containing the active page
  const activeFolder = (() => {
    if (!currentPath.startsWith("wiki/")) return null;
    const rel = currentPath.slice(5);
    const sep = rel.indexOf("/");
    return sep === -1 ? null : rel.slice(0, sep);
  })();

  const [open, setOpen] = useState<Set<string>>(
    new Set(activeFolder ? [activeFolder] : [])
  );

  const toggle = (name: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--card)]">

      {/* ── vault name + search ──────────────────────────────── */}
      <div className="border-b border-[var(--border)] px-3 pt-4 pb-3">
        {/* vault title */}
        <button className="flex w-full items-center justify-between gap-1 rounded px-1 py-0.5 text-left hover:bg-[var(--ring)]/30">
          <span className="truncate text-[13px] font-semibold text-[var(--foreground)]">
            {vaultName ?? "My Wiki"}
          </span>
          <ChevronDown />
        </button>

        {/* search + upload row */}
        <div className="mt-2 flex gap-1.5">
          <Link
            href="/search"
            className="flex flex-1 items-center gap-1.5 rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs text-[var(--muted)] transition hover:border-gray-300 hover:text-[var(--foreground)]"
          >
            <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>Search</span>
            <span className="ml-auto rounded bg-[var(--border)] px-1 font-mono text-[9px]">⌘K</span>
          </Link>
          <Link
            href="/diff"
            title="Review Changes"
            className="flex items-center justify-center rounded-md border border-[var(--border)] bg-white px-2 py-1 text-[var(--muted)] transition hover:border-gray-300 hover:text-[var(--foreground)]"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </Link>
        </div>
      </div>

      {/* ── file tree ────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 text-[13px]">

        {/* WIKI label */}
        <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
          Wiki
        </div>

        {tree.length === 0 && (
          <p className="px-2 py-1 text-xs text-[var(--muted)]">No pages yet.</p>
        )}

        {tree.map((item) => {
          if (item.kind === "file") {
            const active = item.path === currentPath;
            return (
              <Link
                key={item.path}
                href={`/wiki?path=${encodeURIComponent(item.path)}`}
                className={`flex items-center gap-1.5 rounded-md px-2 py-[5px] transition ${
                  active
                    ? "bg-blue-50 font-medium text-blue-700"
                    : "text-[var(--muted)] hover:bg-[var(--ring)]/30 hover:text-[var(--foreground)]"
                }`}
              >
                <PageIcon />
                <span className="truncate">{displayName(item.name)}</span>
              </Link>
            );
          }

          // folder row
          const isOpen = open.has(item.name);
          return (
            <div key={item.name}>
              <button
                onClick={() => toggle(item.name)}
                className="flex w-full items-center gap-1 rounded-md px-2 py-[5px] font-medium text-[var(--foreground)] transition hover:bg-[var(--ring)]/30"
              >
                {isOpen ? <ChevronDown /> : <ChevronRight />}
                <span className="truncate">{folderLabel(item.name)}</span>
              </button>
              {isOpen && (
                <div className="ml-3.5 border-l border-[var(--border)]">
                  {item.children.map((child) => {
                    const active = child.path === currentPath;
                    return (
                      <Link
                        key={child.path}
                        href={`/wiki?path=${encodeURIComponent(child.path)}`}
                        className={`flex items-center gap-1.5 rounded-md py-[5px] pl-3 pr-2 transition ${
                          active
                            ? "bg-blue-50 font-medium text-blue-700"
                            : "text-[var(--muted)] hover:bg-[var(--ring)]/30 hover:text-[var(--foreground)]"
                        }`}
                      >
                        <PageIcon />
                        <span className="truncate">{displayName(child.name)}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* ── SOURCES ────────────────────────────────────────── */}
        <div className="mt-5">
          <div className="mb-1 flex items-center justify-between px-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
              Sources{wikilinks?.length ? ` ${wikilinks.length}` : ""}
            </span>
            <button
              title="Add source"
              className="rounded px-1 text-[var(--muted)] transition hover:text-[var(--foreground)]"
            >
              +
            </button>
          </div>
          {wikilinks?.length ? (
            wikilinks.map((l, i) => (
              <Link
                key={l}
                href={`/wiki?path=${encodeURIComponent(`wiki/topics/${l}.md`)}`}
                className="flex items-center gap-1.5 rounded-md px-2 py-[5px] text-[var(--muted)] transition hover:bg-[var(--ring)]/30 hover:text-[var(--foreground)]"
              >
                <SourceIcon color={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                <span className="truncate text-xs">{l}</span>
              </Link>
            ))
          ) : (
            <p className="px-2 text-xs text-[var(--muted)]/60">No linked sources</p>
          )}
        </div>
      </nav>

      {/* ── quick nav icons ──────────────────────────────────── */}
      <div className="flex items-center justify-around border-t border-[var(--border)] px-2 py-2">
        {[
          { href: "/graph",  title: "Knowledge Graph", icon: <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 7l3.5 3.5M13.5 10.5L17 7M7 17l3.5-3.5M13.5 13.5L17 17" strokeLinecap="round"/></svg> },
          { href: "/diff",   title: "Review Changes",  icon: <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg> },
          { href: "/doctor", title: "Health Check",    icon: <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
          { href: "/search", title: "Search",          icon: <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg> },
          { href: "/",       title: "Dashboard",       icon: <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
        ].map((n) => (
          <Link
            key={n.href}
            href={n.href}
            title={n.title}
            className="rounded p-1.5 text-[var(--muted)] transition hover:bg-[var(--ring)]/40 hover:text-[var(--foreground)]"
          >
            {n.icon}
          </Link>
        ))}
      </div>

      {/* ── page count ───────────────────────────────────────── */}
      <div className="border-t border-[var(--border)] px-3 py-2.5">
        <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--muted)]">
          <span>Pages</span>
          <span>{wikiCount} / 500</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-[var(--border)]">
          <div
            className="h-full rounded-full bg-[var(--accent)]"
            style={{ width: `${Math.min((wikiCount / 500) * 100, 100)}%` }}
          />
        </div>
      </div>
    </aside>
  );
}

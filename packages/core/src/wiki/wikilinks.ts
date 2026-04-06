const LINK_RE = /\[\[([^\]]+)\]\]/g;

export function extractWikilinks(markdown: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(LINK_RE.source, "g");
  while ((m = re.exec(markdown)) !== null) {
    const inner = m[1].trim();
    const target = inner.split("|")[0]?.trim() ?? inner;
    if (target) out.push(target);
  }
  return [...new Set(out)];
}

export function slugifyWikiName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

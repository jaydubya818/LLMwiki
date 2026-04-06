export function replaceMarkedSection(
  md: string,
  start: string,
  end: string,
  inner: string
): string {
  if (md.includes(start) && md.includes(end)) {
    const before = md.split(start)[0];
    const afterPart = md.split(end).slice(1).join(end);
    return `${before}${start}\n${inner}\n${end}${afterPart}`;
  }
  return `${md.trim()}\n\n${start}\n${inner}\n${end}\n`;
}

export const CATALOG_START = "<!-- BRAIN_CATALOG_START -->";
export const CATALOG_END = "<!-- BRAIN_CATALOG_END -->";
export const DASH_ACTIVITY_START = "<!-- BRAIN_ACTIVITY_START -->";
export const DASH_ACTIVITY_END = "<!-- BRAIN_ACTIVITY_END -->";

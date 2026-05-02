const htmlEntityMap: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
};

export function htmlToText(input: string): string {
  return normalizeWhitespace(
    input
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&([a-z]+);/gi, (_, entity: string) => htmlEntityMap[entity.toLowerCase()] ?? `&${entity};`)
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code))),
  );
}

export function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

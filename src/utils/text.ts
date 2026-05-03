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
      .replace(/&#(\d+);/g, (entity: string, code: string) => decodeNumericHtmlEntity(entity, code)),
  );
}

export function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeNumericHtmlEntity(entity: string, code: string): string {
  const codePoint = Number(code);
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return entity;
  }

  return String.fromCodePoint(codePoint);
}

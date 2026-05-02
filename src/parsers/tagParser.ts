export function normalizeTags(input: unknown): string[] {
  const rawTags = toTagStrings(input);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawTag of rawTags) {
    const normalized = normalizeOneTag(rawTag);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function extractInlineTags(content: string): string[] {
  const matches = content.match(/#[\p{L}\p{N}_/-]+/gu) ?? [];
  return normalizeTags(matches);
}

function normalizeOneTag(tag: string): string | undefined {
  const cleaned = tag.trim().replace(/^#+/, "");
  if (!cleaned) {
    return undefined;
  }

  return `#${cleaned}`;
}

function toTagStrings(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.flatMap((item) => toTagStrings(item));
  }

  if (typeof input === "string") {
    return input.split(/[\s,，]+/).filter(Boolean);
  }

  if (isRecord(input)) {
    const name = input.name ?? input.title ?? input.text ?? input.label;
    return typeof name === "string" ? [name] : [];
  }

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

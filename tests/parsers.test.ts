import { describe, expect, it } from "vitest";
import { parseMemo } from "../src/parsers/memoParser.js";
import { extractInlineTags, normalizeTags } from "../src/parsers/tagParser.js";

describe("normalizeTags", () => {
  it("normalizes tag strings and removes duplicates", () => {
    expect(normalizeTags(["知识管理", "#MCP", "MCP", ""])).toEqual(["#知识管理", "#MCP"]);
  });

  it("normalizes tag objects from map and nested shapes", () => {
    expect(
      normalizeTags({
        MCP: true,
        ignored: false,
        primary: { name: "知识管理" },
        extra: ["flomo"],
      }),
    ).toEqual(["#MCP", "#知识管理", "#flomo"]);
  });

  it("extracts inline tags from content", () => {
    expect(extractInlineTags("hello #flomo #知识管理")).toEqual(["#flomo", "#知识管理"]);
  });
});

describe("parseMemo", () => {
  it("maps a raw flomo memo to the stable Memo model", () => {
    const memo = parseMemo(
      {
        slug: "abc123",
        content: "<p>Hello #flomo</p>",
        tags: ["MCP"],
        created_at: 1710000000,
        updated_at: 1710000100,
      },
      "https://flomoapp.com",
    );

    expect(memo).toMatchObject({
      slug: "abc123",
      content: "Hello #flomo",
      tags: ["#MCP", "#flomo"],
      url: "https://flomoapp.com/mine/?memo_id=abc123",
    });
    expect(memo.createdAt).toBe("2024-03-09T16:00:00.000Z");
  });

  it("preserves invalid numeric HTML entities instead of failing the whole memo", () => {
    const memo = parseMemo({
      slug: "bad-entity",
      content: "<p>Hello &#999999999999; world</p>",
      created_at: 1710000000,
    });

    expect(memo.content).toBe("Hello &#999999999999; world");
  });

  it("extracts ordered image metadata from HTML and common attachment arrays", () => {
    const memo = parseMemo({
      slug: "multimodal",
      content:
        '<p>Before</p><img src="https://static.flomoapp.com/media/first.png" alt="first"><img src="https://flomoapp.com/files/shared.jpg">',
      files: [
        { url: "https://static.flomoapp.com/media/first.png", mime_type: "image/png" },
        {
          thumbnail_url: "https://static.flomoapp.com/media/third-thumb.webp",
          url: "https://static.flomoapp.com/media/third.webp",
          name: "third.webp",
        },
      ],
      created_at: 1710000000,
    });

    expect(memo.content).toBe("Before");
    expect(memo.imageCount).toBe(3);
    expect(memo.images).toEqual([
      { index: 1, url: "https://static.flomoapp.com/media/first.png", alt: "first" },
      { index: 2, url: "https://flomoapp.com/files/shared.jpg" },
      {
        index: 3,
        url: "https://static.flomoapp.com/media/third.webp",
        fileName: "third.webp",
      },
    ]);
  });

  it("accepts image-only memos and rejects truly empty memos", () => {
    expect(
      parseMemo({
        slug: "image-only",
        content: '<img src="https://static.flomoapp.com/media/only.png">',
        created_at: 1710000000,
      }),
    ).toMatchObject({
      slug: "image-only",
      content: "",
      imageCount: 1,
    });

    expect(() => parseMemo({ slug: "empty" })).toThrow(/content\/html\/text/i);
  });

  it("ignores non-HTTPS attachment URLs at parse time", () => {
    expect(
      parseMemo({
        slug: "mixed-schemes",
        content: "safe text",
        files: [
          { type: "image", url: "http://static.flomoapp.com/insecure.png" },
          { type: "image", url: "data:image/png;base64,AA==" },
        ],
      }),
    ).toMatchObject({ imageCount: 0, images: [] });
  });
});

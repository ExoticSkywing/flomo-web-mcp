import { afterEach, describe, expect, it, vi } from "vitest";
import type { EnvConfig } from "../src/config/env.js";
import { SecureMemoImageLoader } from "../src/clients/memoImageLoader.js";
import type { Memo } from "../src/models/memo.js";

const PUBLIC_IP = [{ address: "203.0.113.10", family: 4 }];
const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function memoWithImages(...urls: string[]): Memo {
  return {
    slug: "memo",
    content: "memo text",
    tags: [],
    url: "https://v.flomoapp.com/mine/?memo_id=memo",
    createdAt: "",
    updatedAt: "",
    images: urls.map((url, offset) => ({ index: offset + 1, url })),
    imageCount: urls.length,
  };
}

describe("SecureMemoImageLoader", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("downloads supported images in memo order without forwarding flomo credentials", async () => {
    const requests: Array<{ url: string; headers: Headers }> = [];
    const loader = makeLoader(async (input, init) => {
      requests.push({ url: String(input), headers: new Headers(init?.headers) });
      return imageResponse(PNG_BYTES, "image/png");
    });

    const result = await loader.load(
      memoWithImages("https://static.flomoapp.com/one.png?signature=secret", "https://flomoapp.com/two.png"),
    );

    expect(result.failures).toEqual([]);
    expect(result.images.map(({ index, mimeType }) => ({ index, mimeType }))).toEqual([
      { index: 1, mimeType: "image/png" },
      { index: 2, mimeType: "image/png" },
    ]);
    expect(Buffer.from(result.images[0]?.data ?? "", "base64")).toEqual(Buffer.from(PNG_BYTES));
    expect(requests[0]?.headers.has("Authorization")).toBe(false);
    expect(requests[0]?.headers.has("Cookie")).toBe(false);
  });

  it("reports partial results while retaining successful images", async () => {
    let request = 0;
    const loader = makeLoader(async () => {
      request += 1;
      return request === 1 ? imageResponse(PNG_BYTES, "image/png") : new Response("expired", { status: 403 });
    });

    const result = await loader.load(
      memoWithImages("https://static.flomoapp.com/ok.png", "https://static.flomoapp.com/expired.png?token=secret"),
    );

    expect(result.images).toHaveLength(1);
    expect(result.failures).toEqual([
      { index: 2, code: "IMAGE_AUTH_EXPIRED", message: "图片请求失败，HTTP 403。" },
    ]);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it.each([
    ["plain HTTP", "http://static.flomoapp.com/image.png", "UNTRUSTED_IMAGE_URL"],
    ["allowlist suffix bypass", "https://flomoapp.com.attacker.test/image.png", "UNTRUSTED_IMAGE_URL"],
    ["unrelated host", "https://example.test/image.png", "UNTRUSTED_IMAGE_URL"],
  ])("rejects %s before making a request", async (_name, url, code) => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await makeLoader(fetchImpl).load(memoWithImages(url));
    expect(result.failures[0]?.code).toBe(code);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects DNS addresses in private ranges before making a request", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const loader = new SecureMemoImageLoader(makeConfig(), {
      fetchImpl,
      lookupAll: async () => [{ address: "127.0.0.1", family: 4 }],
    });

    const result = await loader.load(memoWithImages("https://static.flomoapp.com/image.png"));
    expect(result.failures[0]?.code).toBe("UNTRUSTED_IMAGE_ADDRESS");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("revalidates redirected hosts before following them", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.redirect("https://attacker.test/private.png", 302),
    );
    const result = await makeLoader(fetchImpl).load(memoWithImages("https://static.flomoapp.com/image.png"));

    expect(result.failures[0]?.code).toBe("UNTRUSTED_IMAGE_URL");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects HTML disguised as an image and mismatched MIME declarations", async () => {
    const html = await makeLoader(async () => new Response("<html>login</html>", { headers: { "Content-Type": "image/png" } })).load(
      memoWithImages("https://static.flomoapp.com/fake.png"),
    );
    expect(html.failures[0]?.code).toBe("INVALID_IMAGE");

    const mismatched = await makeLoader(async () => imageResponse(PNG_BYTES, "image/jpeg")).load(
      memoWithImages("https://static.flomoapp.com/fake.jpg"),
    );
    expect(mismatched.failures[0]?.code).toBe("INVALID_IMAGE");
  });

  it("enforces image, memo total, and count limits", async () => {
    const single = await makeLoader(async () => imageResponse(PNG_BYTES, "image/png"), { imageMaxBytes: 8 }).load(
      memoWithImages("https://static.flomoapp.com/large.png"),
    );
    expect(single.failures[0]?.code).toBe("IMAGE_SIZE_LIMIT");

    const total = await makeLoader(async () => imageResponse(PNG_BYTES, "image/png"), {
      memoImageMaxBytes: PNG_BYTES.byteLength,
    }).load(memoWithImages("https://static.flomoapp.com/one.png", "https://static.flomoapp.com/two.png"));
    expect(total.images).toHaveLength(1);
    expect(total.failures[0]?.code).toBe("MEMO_SIZE_LIMIT");

    const count = await makeLoader(async () => imageResponse(PNG_BYTES, "image/png"), { memoImageMaxCount: 1 }).load(
      memoWithImages("https://static.flomoapp.com/one.png", "https://static.flomoapp.com/two.png"),
    );
    expect(count.images).toHaveLength(1);
    expect(count.failures[0]?.code).toBe("IMAGE_COUNT_LIMIT");
  });

  it("reports a request timeout without leaking the signed URL", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "TimeoutError")));
        }),
    );
    const pending = makeLoader(fetchImpl, { imageRequestTimeoutMs: 10 }).load(
      memoWithImages("https://static.flomoapp.com/image.png?signature=top-secret"),
    );
    await vi.advanceTimersByTimeAsync(10);

    const result = await pending;
    expect(result.failures[0]).toEqual({ index: 1, code: "IMAGE_TIMEOUT", message: "图片请求超时。" });
    expect(JSON.stringify(result)).not.toContain("top-secret");
  });
});

function makeLoader(fetchImpl: typeof fetch, overrides: Partial<EnvConfig> = {}): SecureMemoImageLoader {
  return new SecureMemoImageLoader(makeConfig(overrides), {
    fetchImpl,
    lookupAll: async () => PUBLIC_IP,
  });
}

function imageResponse(bytes: Uint8Array, contentType: string): Response {
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
    },
  });
}

function makeConfig(overrides: Partial<EnvConfig> = {}): EnvConfig {
  return {
    authorization: "Bearer must-not-be-forwarded",
    cookie: "session=must-not-be-forwarded",
    userAgent: "test-agent",
    baseUrl: "https://flomoapp.com",
    webBaseUrl: "https://v.flomoapp.com",
    timezone: "Asia/Shanghai",
    logLevel: "info",
    imageRequestTimeoutMs: 100,
    imageMaxBytes: 1024,
    memoImageMaxBytes: 2048,
    memoImageMaxCount: 10,
    ...overrides,
  };
}

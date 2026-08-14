import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";

describe("loadEnv", () => {
  it("normalizes flomo endpoint defaults and authorization", () => {
    const config = loadEnv({
      FLOMO_AUTHORIZATION: " test-token ",
      FLOMO_BASE_URL: "https://flomoapp.com/",
      FLOMO_WEB_BASE_URL: "https://v.flomoapp.com/",
      FLOMO_TIMEZONE: "UTC",
    });

    expect(config).toMatchObject({
      authorization: "test-token",
      baseUrl: "https://flomoapp.com",
      webBaseUrl: "https://v.flomoapp.com",
      timezone: "UTC",
      webPlatform: "Web",
      deviceModel: "Other",
      requestTimeoutMs: 30_000,
      imageRequestTimeoutMs: 15_000,
      imageMaxBytes: 10 * 1024 * 1024,
      memoImageMaxBytes: 30 * 1024 * 1024,
      memoImageMaxCount: 20,
    });
    expect(config.deviceId).toEqual(expect.any(String));
  });

  it("rejects invalid IANA timezone names before runtime requests", () => {
    expect(() => loadEnv({ FLOMO_TIMEZONE: "Mars/Base" })).toThrow(/FLOMO_TIMEZONE/);
  });

  it("loads a positive request timeout from env", () => {
    expect(loadEnv({ FLOMO_REQUEST_TIMEOUT_MS: "1500" }).requestTimeoutMs).toBe(1500);
    expect(() => loadEnv({ FLOMO_REQUEST_TIMEOUT_MS: "0" })).toThrow(/FLOMO_REQUEST_TIMEOUT_MS/);
  });

  it("loads positive multimodal image limits from env", () => {
    expect(
      loadEnv({
        FLOMO_IMAGE_REQUEST_TIMEOUT_MS: "1000",
        FLOMO_IMAGE_MAX_BYTES: "2048",
        FLOMO_MEMO_IMAGE_MAX_BYTES: "4096",
        FLOMO_MEMO_IMAGE_MAX_COUNT: "3",
      }),
    ).toMatchObject({
      imageRequestTimeoutMs: 1000,
      imageMaxBytes: 2048,
      memoImageMaxBytes: 4096,
      memoImageMaxCount: 3,
    });
    expect(() => loadEnv({ FLOMO_IMAGE_MAX_BYTES: "0" })).toThrow(/FLOMO_IMAGE_MAX_BYTES/);
  });
});

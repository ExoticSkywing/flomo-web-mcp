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
    });
    expect(config.deviceId).toEqual(expect.any(String));
  });

  it("rejects invalid IANA timezone names before runtime requests", () => {
    expect(() => loadEnv({ FLOMO_TIMEZONE: "Mars/Base" })).toThrow(/FLOMO_TIMEZONE/);
  });
});

import { describe, expect, it } from "vitest";
import { appendQueryString, buildFlomoWebQuery } from "../src/clients/flomoWeb.js";

describe("buildFlomoWebQuery", () => {
  it("adds flomo web defaults and signs sorted params", () => {
    const query = buildFlomoWebQuery(
      {
        limit: 200,
        latest_updated_at: 0,
        latest_slug: "",
        tz: "8:0",
      },
      {
        now: () => 1_710_000_000,
        webp: true,
      },
    );

    expect(query).toMatchObject({
      limit: 200,
      latest_updated_at: 0,
      latest_slug: "",
      tz: "8:0",
      timestamp: 1_710_000_000,
      api_key: "flomo_web",
      app_version: "4.0",
      platform: "web",
      webp: "1",
      sign: "2c1f291f0a55035a421d4be264f29eb3",
    });
  });
});

describe("appendQueryString", () => {
  it("appends signed query params to endpoints with or without existing query", () => {
    const endpoint = appendQueryString("/api/v1/memo/latest_updated_desc?existing=1", {
      tz: "8:0",
      sign: "abc123",
    });

    expect(endpoint).toBe("/api/v1/memo/latest_updated_desc?existing=1&tz=8%3A0&sign=abc123");
  });
});

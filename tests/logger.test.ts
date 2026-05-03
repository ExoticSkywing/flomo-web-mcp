import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../src/utils/logger.js";

describe("createLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts nested authorization, cookie, and token metadata", () => {
    const write = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logger = createLogger("debug");

    logger.debug("request metadata", {
      headers: {
        Authorization: "Bearer abcdefghijklmnopqrstuvwxyz",
        Cookie: "sid=secret-session-value",
      },
      context: {
        refreshToken: "short",
        note: "safe metadata",
      },
    });

    const entry = JSON.parse(String(write.mock.calls[0]?.[0])) as Record<string, unknown>;

    expect(entry).toMatchObject({
      level: "debug",
      message: "request metadata",
      headers: {
        Authorization: "Bearer a...wxyz",
        Cookie: "sid=secr...alue",
      },
      context: {
        refreshToken: "***",
        note: "safe metadata",
      },
    });
  });

  it("redacts arrays stored under secret metadata keys", () => {
    const write = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logger = createLogger("debug");

    logger.debug("tokens", {
      tokens: ["abcdefghijklmnop", "short"],
    });

    const entry = JSON.parse(String(write.mock.calls[0]?.[0])) as Record<string, unknown>;

    expect(entry).toMatchObject({
      tokens: ["abcdefgh...mnop", "***"],
    });
  });

  it("redacts objects stored under secret metadata keys", () => {
    const write = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logger = createLogger("debug");

    logger.debug("token object", {
      token: {
        value: "abcdefghijklmnopqrstuvwxyz",
      },
    });

    const entry = JSON.parse(String(write.mock.calls[0]?.[0])) as Record<string, unknown>;

    expect(entry).toMatchObject({
      token: "***",
    });
  });
});

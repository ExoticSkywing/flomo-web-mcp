import "dotenv/config";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface EnvConfig {
  authorization?: string;
  cookie?: string;
  userAgent: string;
  baseUrl: string;
  webBaseUrl?: string;
  timezone: string;
  logLevel: LogLevel;
  readEndpoint?: string;
  writeEndpoint?: string;
  debugRawResponse: boolean;
  deviceId?: string;
  deviceModel?: string;
  webPlatform?: string;
}

const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);

const EnvSchema = z.object({
  FLOMO_AUTHORIZATION: z.string().optional(),
  FLOMO_COOKIE: z.string().optional(),
  FLOMO_USER_AGENT: z.string().optional(),
  FLOMO_BASE_URL: z.string().url().optional(),
  FLOMO_WEB_BASE_URL: z.string().url().optional(),
  FLOMO_TIMEZONE: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
  FLOMO_READ_ENDPOINT: z.string().optional(),
  FLOMO_WRITE_ENDPOINT: z.string().optional(),
  FLOMO_DEBUG_RAW_RESPONSE: z.string().optional(),
  FLOMO_DEVICE_ID: z.string().optional(),
  FLOMO_DEVICE_MODEL: z.string().optional(),
  FLOMO_WEB_PLATFORM: z.string().optional(),
});

const defaultDeviceId = randomUUID();

export function loadEnv(env: NodeJS.ProcessEnv = process.env): EnvConfig {
  const parsed = EnvSchema.parse(env);
  const logLevel = LogLevelSchema.safeParse(parsed.LOG_LEVEL);

  return {
    authorization: emptyToUndefined(parsed.FLOMO_AUTHORIZATION),
    cookie: emptyToUndefined(parsed.FLOMO_COOKIE),
    userAgent: parsed.FLOMO_USER_AGENT?.trim() || "Mozilla/5.0",
    baseUrl: trimTrailingSlash(parsed.FLOMO_BASE_URL?.trim() || "https://flomoapp.com"),
    webBaseUrl: trimTrailingSlash(parsed.FLOMO_WEB_BASE_URL?.trim() || "https://v.flomoapp.com"),
    timezone: parsed.FLOMO_TIMEZONE?.trim() || "Asia/Shanghai",
    logLevel: logLevel.success ? logLevel.data : "info",
    readEndpoint: emptyToUndefined(parsed.FLOMO_READ_ENDPOINT),
    writeEndpoint: emptyToUndefined(parsed.FLOMO_WRITE_ENDPOINT),
    debugRawResponse: parsed.FLOMO_DEBUG_RAW_RESPONSE === "true",
    deviceId: emptyToUndefined(parsed.FLOMO_DEVICE_ID) ?? defaultDeviceId,
    deviceModel: emptyToUndefined(parsed.FLOMO_DEVICE_MODEL) ?? "Other",
    webPlatform: emptyToUndefined(parsed.FLOMO_WEB_PLATFORM) ?? "Web",
  };
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

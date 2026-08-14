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
  syncEndpoint?: string;
  writeEndpoint?: string;
  deviceId?: string;
  deviceModel?: string;
  webPlatform?: string;
  requestTimeoutMs?: number;
  imageRequestTimeoutMs?: number;
  imageMaxBytes?: number;
  memoImageMaxBytes?: number;
  memoImageMaxCount?: number;
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
  FLOMO_SYNC_ENDPOINT: z.string().optional(),
  FLOMO_WRITE_ENDPOINT: z.string().optional(),
  FLOMO_DEVICE_ID: z.string().optional(),
  FLOMO_DEVICE_MODEL: z.string().optional(),
  FLOMO_WEB_PLATFORM: z.string().optional(),
  FLOMO_REQUEST_TIMEOUT_MS: z.string().optional(),
  FLOMO_IMAGE_REQUEST_TIMEOUT_MS: z.string().optional(),
  FLOMO_IMAGE_MAX_BYTES: z.string().optional(),
  FLOMO_MEMO_IMAGE_MAX_BYTES: z.string().optional(),
  FLOMO_MEMO_IMAGE_MAX_COUNT: z.string().optional(),
});

const defaultDeviceId = randomUUID();

export function loadEnv(env: NodeJS.ProcessEnv = process.env): EnvConfig {
  const parsed = EnvSchema.parse(env);
  const logLevel = LogLevelSchema.safeParse(parsed.LOG_LEVEL);
  const timezone = parsed.FLOMO_TIMEZONE?.trim() || "Asia/Shanghai";
  validateTimezone(timezone);

  return {
    authorization: emptyToUndefined(parsed.FLOMO_AUTHORIZATION),
    cookie: emptyToUndefined(parsed.FLOMO_COOKIE),
    userAgent: parsed.FLOMO_USER_AGENT?.trim() || "Mozilla/5.0",
    baseUrl: trimTrailingSlash(parsed.FLOMO_BASE_URL?.trim() || "https://flomoapp.com"),
    webBaseUrl: trimTrailingSlash(parsed.FLOMO_WEB_BASE_URL?.trim() || "https://v.flomoapp.com"),
    timezone,
    logLevel: logLevel.success ? logLevel.data : "info",
    readEndpoint: emptyToUndefined(parsed.FLOMO_READ_ENDPOINT),
    syncEndpoint: emptyToUndefined(parsed.FLOMO_SYNC_ENDPOINT),
    writeEndpoint: emptyToUndefined(parsed.FLOMO_WRITE_ENDPOINT),
    deviceId: emptyToUndefined(parsed.FLOMO_DEVICE_ID) ?? defaultDeviceId,
    deviceModel: emptyToUndefined(parsed.FLOMO_DEVICE_MODEL) ?? "Other",
    webPlatform: emptyToUndefined(parsed.FLOMO_WEB_PLATFORM) ?? "Web",
    requestTimeoutMs: parsePositiveInteger(parsed.FLOMO_REQUEST_TIMEOUT_MS, 30_000, "FLOMO_REQUEST_TIMEOUT_MS"),
    imageRequestTimeoutMs: parsePositiveInteger(
      parsed.FLOMO_IMAGE_REQUEST_TIMEOUT_MS,
      15_000,
      "FLOMO_IMAGE_REQUEST_TIMEOUT_MS",
    ),
    imageMaxBytes: parsePositiveInteger(parsed.FLOMO_IMAGE_MAX_BYTES, 10 * 1024 * 1024, "FLOMO_IMAGE_MAX_BYTES"),
    memoImageMaxBytes: parsePositiveInteger(
      parsed.FLOMO_MEMO_IMAGE_MAX_BYTES,
      30 * 1024 * 1024,
      "FLOMO_MEMO_IMAGE_MAX_BYTES",
    ),
    memoImageMaxCount: parsePositiveInteger(parsed.FLOMO_MEMO_IMAGE_MAX_COUNT, 20, "FLOMO_MEMO_IMAGE_MAX_COUNT"),
  };
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function validateTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch (error) {
    throw new Error(`FLOMO_TIMEZONE 不是有效的 IANA timezone：${timezone}`, { cause: error });
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} 必须是正整数。`);
  }

  return parsed;
}

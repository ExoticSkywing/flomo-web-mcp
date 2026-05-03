import type { EnvConfig } from "../config/env.js";
import { requireAuthorization } from "../utils/auth.js";
import { FlomoAuthError, FlomoParseError, FlomoRequestError } from "../utils/errors.js";

export class FlomoHttpClient {
  constructor(private readonly config: EnvConfig) {}

  async requestJson<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(this.toUrl(endpoint), {
      ...init,
      headers: this.buildHeaders(init.headers),
    });
    const text = await response.text();

    if (!response.ok) {
      throwHttpError(response.status, text);
    }

    if (!text) {
      return undefined as T;
    }

    try {
      const parsed = JSON.parse(text) as T;
      validateFlomoApiResponse(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof FlomoRequestError || error instanceof FlomoAuthError) {
        throw error;
      }
      throw new FlomoParseError("flomo 返回的响应不是合法 JSON。", { cause: error });
    }
  }

  private buildHeaders(headersInit: HeadersInit | undefined): Headers {
    const headers = new Headers(headersInit);
    headers.set("Accept", "application/json, text/plain, */*");
    headers.set("Authorization", requireAuthorization(this.config));
    headers.set("User-Agent", this.config.userAgent);
    headers.set("Origin", this.webBaseUrl);
    headers.set("Referer", `${this.webBaseUrl}/`);
    headers.set("X-Timezone", this.config.timezone);

    if (this.config.webPlatform) {
      headers.set("platform", this.config.webPlatform);
    }

    if (this.config.deviceModel) {
      headers.set("device-model", this.config.deviceModel);
    }

    if (this.config.deviceId) {
      headers.set("device-id", this.config.deviceId);
    }

    if (this.config.cookie) {
      headers.set("Cookie", this.config.cookie);
    }

    return headers;
  }

  private toUrl(endpoint: string): string {
    if (/^https?:\/\//i.test(endpoint)) {
      return endpoint;
    }

    const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    return `${this.config.baseUrl}${normalizedEndpoint}`;
  }

  private get webBaseUrl(): string {
    return this.config.webBaseUrl ?? this.config.baseUrl;
  }
}

function throwHttpError(status: number, body: string): never {
  if (status === 401 || status === 403) {
    throw new FlomoAuthError("flomo 登录态失效或权限不足，请重新抓取 Authorization。", { status });
  }

  if (status === 400) {
    const message = extractResponseMessage(body) ?? "flomo 请求体不符合当前接口要求。";
    const code = looksLikeSignError(message) ? "SIGN_INVALID" : "BAD_REQUEST";
    throw new FlomoRequestError(code, message, { status });
  }

  if (status === 429) {
    throw new FlomoRequestError("RATE_LIMITED", "flomo 请求过于频繁，请稍后再试。", { status });
  }

  const message = body ? `flomo 请求失败，HTTP ${status}。` : `flomo 请求失败，HTTP ${status}，无响应体。`;
  throw new FlomoRequestError("REMOTE_CHANGED", message, { status });
}

function validateFlomoApiResponse(value: unknown): void {
  if (!isRecord(value) || typeof value.code !== "number" || value.code === 0) {
    return;
  }

  const message = typeof value.message === "string" && value.message.trim() ? value.message : "flomo 返回业务错误。";
  if (value.code === -20 || looksLikeSignError(message)) {
    throw new FlomoRequestError("SIGN_INVALID", message);
  }

  if (value.code === -1) {
    throw new FlomoRequestError("BAD_REQUEST", message);
  }

  throw new FlomoRequestError("REMOTE_CHANGED", message);
}

function extractResponseMessage(body: string): string | undefined {
  if (!body) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    if (isRecord(parsed) && typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message;
    }
  } catch {
    return body;
  }

  return body;
}

function looksLikeSignError(message: string): boolean {
  return /sign|signature|签名/i.test(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

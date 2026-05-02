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
      return JSON.parse(text) as T;
    } catch (error) {
      throw new FlomoParseError("flomo 返回的响应不是合法 JSON。", { cause: error });
    }
  }

  private buildHeaders(headersInit: HeadersInit | undefined): Headers {
    const headers = new Headers(headersInit);
    headers.set("Accept", "application/json, text/plain, */*");
    headers.set("Authorization", requireAuthorization(this.config));
    headers.set("User-Agent", this.config.userAgent);
    headers.set("Origin", this.config.baseUrl);
    headers.set("Referer", `${this.config.baseUrl}/`);
    headers.set("X-Timezone", this.config.timezone);

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
}

function throwHttpError(status: number, body: string): never {
  if (status === 401 || status === 403) {
    throw new FlomoAuthError("flomo 登录态失效或权限不足，请重新抓取 Authorization。", { status });
  }

  if (status === 429) {
    throw new FlomoRequestError("RATE_LIMITED", "flomo 请求过于频繁，请稍后再试。", { status });
  }

  const message = body ? `flomo 请求失败，HTTP ${status}。` : `flomo 请求失败，HTTP ${status}，无响应体。`;
  throw new FlomoRequestError("REMOTE_CHANGED", message, { status });
}

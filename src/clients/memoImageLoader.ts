import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import type { EnvConfig } from "../config/env.js";
import type { Memo } from "../models/memo.js";
import type {
  DownloadedMemoImage,
  MemoImageFailure,
  MemoImageLoader,
  MemoImageLoadResult,
} from "../types/flomo.js";

const DEFAULT_ALLOWED_HOSTS = ["flomoapp.com", "flomo.app"];
const MAX_REDIRECTS = 5;
const MAGIC_BYTE_LENGTH = 32;

type LookupAddress = { address: string; family: number };
type LookupAll = (hostname: string) => Promise<LookupAddress[]>;

interface MemoImageDownloaderOptions {
  fetchImpl?: typeof fetch;
  lookupAll?: LookupAll;
  allowedHosts?: string[];
}

class ImageDownloadError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ImageDownloadError";
  }
}

export class SecureMemoImageLoader implements MemoImageLoader {
  private readonly fetchImpl: typeof fetch;
  private readonly lookupAll: LookupAll;
  private readonly allowedHosts: string[];

  constructor(
    private readonly config: EnvConfig,
    options: MemoImageDownloaderOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.lookupAll = options.lookupAll ?? defaultLookupAll;
    this.allowedHosts = (options.allowedHosts ?? DEFAULT_ALLOWED_HOSTS).map((host) => host.toLowerCase());
  }

  async load(memo: Memo): Promise<MemoImageLoadResult> {
    const maxCount = this.config.memoImageMaxCount ?? 20;
    const maxTotalBytes = this.config.memoImageMaxBytes ?? 30 * 1024 * 1024;
    const images: DownloadedMemoImage[] = [];
    const failures: MemoImageFailure[] = [];
    let totalBytes = 0;

    if (memo.images.length > maxCount) {
      for (const image of memo.images.slice(maxCount)) {
        failures.push({
          index: image.index,
          code: "IMAGE_COUNT_LIMIT",
          message: `图片数量超过单条 memo 上限 ${maxCount}。`,
        });
      }
    }

    for (const image of memo.images.slice(0, maxCount)) {
      try {
        const downloaded = await this.download(image.url, image.index, maxTotalBytes - totalBytes);
        images.push(downloaded);
        totalBytes += downloaded.size;
      } catch (error) {
        failures.push(toImageFailure(image.index, error));
      }
    }

    return { images, failures };
  }

  private async download(url: string, index: number, remainingTotalBytes: number): Promise<DownloadedMemoImage> {
    const maxImageBytes = this.config.imageMaxBytes ?? 10 * 1024 * 1024;
    const maxBytes = Math.min(maxImageBytes, remainingTotalBytes);
    if (maxBytes <= 0) {
      throw new ImageDownloadError("MEMO_SIZE_LIMIT", "单条 memo 的图片总大小超过上限。");
    }

    const response = await this.fetchWithValidatedRedirects(url);
    if (!response.ok) {
      throw new ImageDownloadError(
        response.status === 401 || response.status === 403 ? "IMAGE_AUTH_EXPIRED" : "IMAGE_HTTP_ERROR",
        `图片请求失败，HTTP ${response.status}。`,
      );
    }

    const contentLength = parseContentLength(response.headers.get("content-length"));
    if (contentLength !== undefined && contentLength > maxBytes) {
      throw new ImageDownloadError("IMAGE_SIZE_LIMIT", `图片大小超过当前允许的 ${maxBytes} 字节。`);
    }

    const bytes = await readBodyWithLimit(response, maxBytes);
    const detectedMimeType = detectImageMimeType(bytes);
    if (!detectedMimeType) {
      throw new ImageDownloadError("INVALID_IMAGE", "响应内容不是支持的图片格式。");
    }

    const declaredMimeType = normalizeMimeType(response.headers.get("content-type"));
    if (declaredMimeType && declaredMimeType !== detectedMimeType) {
      throw new ImageDownloadError("INVALID_IMAGE", "图片 Content-Type 与实际文件格式不一致。");
    }

    return {
      index,
      data: Buffer.from(bytes).toString("base64"),
      mimeType: detectedMimeType,
      size: bytes.byteLength,
    };
  }

  private async fetchWithValidatedRedirects(input: string): Promise<Response> {
    let url = new URL(input);
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      await this.validateUrl(url);
      const abort = AbortSignal.timeout(this.config.imageRequestTimeoutMs ?? 15_000);
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          redirect: "manual",
          signal: abort,
          headers: {
            Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
            "User-Agent": this.config.userAgent,
            Referer: `${this.config.webBaseUrl ?? this.config.baseUrl}/`,
          },
        });
      } catch (error) {
        if (isAbortError(error)) {
          throw new ImageDownloadError("IMAGE_TIMEOUT", "图片请求超时。");
        }
        throw new ImageDownloadError("IMAGE_NETWORK_ERROR", "图片网络请求失败。");
      }

      if (!isRedirect(response.status)) {
        return response;
      }
      const location = response.headers.get("location");
      if (!location) {
        throw new ImageDownloadError("INVALID_REDIRECT", "图片重定向响应缺少 Location。");
      }
      if (redirectCount === MAX_REDIRECTS) {
        throw new ImageDownloadError("TOO_MANY_REDIRECTS", "图片重定向次数超过上限。");
      }
      url = new URL(location, url);
    }

    throw new ImageDownloadError("TOO_MANY_REDIRECTS", "图片重定向次数超过上限。");
  }

  private async validateUrl(url: URL): Promise<void> {
    if (url.protocol !== "https:") {
      throw new ImageDownloadError("UNTRUSTED_IMAGE_URL", "图片 URL 必须使用 HTTPS。");
    }

    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!this.allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
      throw new ImageDownloadError("UNTRUSTED_IMAGE_URL", "图片来源不在 flomo 受信任域名范围内。");
    }

    let addresses: LookupAddress[];
    try {
      addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await this.lookupAll(hostname);
    } catch {
      throw new ImageDownloadError("IMAGE_DNS_ERROR", "图片域名解析失败。");
    }
    if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIp(address))) {
      throw new ImageDownloadError("UNTRUSTED_IMAGE_ADDRESS", "图片域名解析到了非公网地址。");
    }
  }
}

async function defaultLookupAll(hostname: string): Promise<LookupAddress[]> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ImageDownloadError("IMAGE_SIZE_LIMIT", `图片大小超过当前允许的 ${maxBytes} 字节。`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseContentLength(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function detectImageMimeType(bytes: Uint8Array): string | undefined {
  const head = bytes.subarray(0, MAGIC_BYTE_LENGTH);
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(head, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (ascii(head, 0, 6) === "GIF87a" || ascii(head, 0, 6) === "GIF89a") {
    return "image/gif";
  }
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WEBP") {
    return "image/webp";
  }
  if (ascii(head, 4, 4) === "ftyp" && ["avif", "avis"].includes(ascii(head, 8, 4))) {
    return "image/avif";
  }
  return undefined;
}

function normalizeMimeType(value: string | null): string | undefined {
  const mimeType = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (!mimeType || mimeType === "application/octet-stream" || mimeType === "binary/octet-stream") {
    return undefined;
  }
  return mimeType;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name);
}

function toImageFailure(index: number, error: unknown): MemoImageFailure {
  if (error instanceof ImageDownloadError) {
    return { index, code: error.code, message: sanitizeMessage(error.message) };
  }
  return { index, code: "IMAGE_DOWNLOAD_FAILED", message: "图片下载失败。" };
}

function sanitizeMessage(message: string): string {
  return message
    .replace(/https:\/\/[^\s]+/gi, "[redacted-url]")
    .replace(/(?:authorization|cookie|token)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
}

function isPublicIp(address: string): boolean {
  const normalized = address.toLowerCase().split("%", 1)[0] ?? address.toLowerCase();
  const family = isIP(normalized);
  if (family === 4) {
    const [a = 0, b = 0] = normalized.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (family === 6) {
    if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd")) {
      return false;
    }
    if (/^fe[89ab]/i.test(normalized) || normalized.startsWith("ff")) {
      return false;
    }
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? isPublicIp(mapped) : true;
  }
  return false;
}

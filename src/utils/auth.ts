import type { EnvConfig } from "../config/env.js";
import { FlomoAuthError } from "./errors.js";

export function requireAuthorization(config: EnvConfig): string {
  const authorization = normalizeAuthorization(config.authorization);
  if (!authorization) {
    throw new FlomoAuthError("未配置 FLOMO_AUTHORIZATION，请先从 flomo Web 抓取 Bearer Token。");
  }
  return authorization;
}

export function normalizeAuthorization(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return /^bearer\s+/i.test(trimmed) ? trimmed : `Bearer ${trimmed}`;
}

export function maskSecret(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value.length <= 12) {
    return "***";
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

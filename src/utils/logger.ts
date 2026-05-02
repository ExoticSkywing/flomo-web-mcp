import type { LogLevel } from "../config/env.js";
import { maskSecret } from "./auth.js";

const weights: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export function createLogger(level: LogLevel): Logger {
  function write(entryLevel: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (weights[entryLevel] < weights[level]) {
      return;
    }

    const safeMeta = redactMeta(meta);
    console.error(JSON.stringify({ level: entryLevel, message, ...safeMeta }));
  }

  return {
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
  };
}

function redactMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) {
    return undefined;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (/authorization|cookie|token/i.test(key) && typeof value === "string") {
      result[key] = maskSecret(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

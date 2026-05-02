import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { toPublicError } from "../utils/errors.js";

export type ToolResponse = CallToolResult;

export function jsonToolResponse(value: unknown, isError = false): ToolResponse {
  return {
    ...(isError ? { isError } : {}),
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  } satisfies CallToolResult;
}

export async function runJsonTool(action: () => Promise<unknown>): Promise<ToolResponse> {
  try {
    return jsonToolResponse(await action());
  } catch (error) {
    return jsonToolResponse(
      {
        ok: false,
        error: toPublicError(error),
      },
      true,
    );
  }
}

import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { GroupOrderError } from "@/lib/group-order-data";

const STATUS: Record<GroupOrderError["code"], number> = {
  unavailable: 503,
  not_found: 404,
  closed: 409,
  forbidden: 403,
  invalid: 400,
  too_many: 429
};

export async function readSmallJson(req: NextRequest, maxBytes = 16 * 1024) {
  const text = await req.text();

  if (text.length > maxBytes) {
    throw new GroupOrderError("invalid");
  }

  try {
    const value = JSON.parse(text) as unknown;

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new GroupOrderError("invalid");
    }

    return value as Record<string, unknown>;
  } catch {
    throw new GroupOrderError("invalid");
  }
}

export function groupErrorResponse(error: unknown) {
  const code = error instanceof GroupOrderError ? error.code : "unavailable";
  return NextResponse.json(
    { error: code },
    { status: STATUS[code], headers: { "Cache-Control": "private, no-store" } }
  );
}

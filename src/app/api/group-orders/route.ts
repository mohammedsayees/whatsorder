// POST /api/group-orders: start an office group order for one restaurant.
// Returns the share token (for the link) and the organiser's secret (kept
// only in the organiser's browser; the server stores its hash).

import { NextRequest, NextResponse } from "next/server";
import { normalizeParticipantName } from "@/lib/group-order";
import { GroupOrderError, createGroup } from "@/lib/group-order-data";
import { groupErrorResponse, readSmallJson } from "@/lib/group-order-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_IP = 10;
const createdByIp = new Map<string, { count: number; resetAt: number }>();

function allow(ip: string) {
  const now = Date.now();
  const entry = createdByIp.get(ip);

  if (!entry || entry.resetAt <= now) {
    if (createdByIp.size > 5000) {
      createdByIp.clear();
    }
    createdByIp.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  entry.count += 1;
  return entry.count <= MAX_PER_IP;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  if (!allow(ip)) {
    return groupErrorResponse(new GroupOrderError("too_many"));
  }

  try {
    const body = await readSmallJson(req);
    const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
    const name = normalizeParticipantName(body.name);

    if (!UUID.test(restaurantId) || !name) {
      throw new GroupOrderError("invalid");
    }

    const created = await createGroup(restaurantId.toLowerCase(), name);
    return NextResponse.json(created, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return groupErrorResponse(error);
  }
}

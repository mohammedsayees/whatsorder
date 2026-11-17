// POST /api/group-orders/:token/:action
//   lines    { participantId, name, lines }   add my items (link holders)
//   remove   { participantId, lineId }        remove one of my items
//   lock     { organiserToken }               organiser: stop adds, get all lines
//   reopen   { organiserToken }               organiser: allow adds again
//   complete { organiserToken, orderId }      organiser: mark as ordered

import { NextRequest, NextResponse } from "next/server";
import { isParticipantId, isShareToken, normalizeParticipantName } from "@/lib/group-order";
import {
  GroupOrderError,
  addGroupLines,
  completeGroup,
  lockGroup,
  removeGroupLine,
  reopenGroup
} from "@/lib/group-order-data";
import { groupErrorResponse, readSmallJson } from "@/lib/group-order-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = (body: Record<string, unknown> = { ok: true }) =>
  NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; action: string }> }
): Promise<NextResponse> {
  const { token, action } = await params;

  try {
    if (!isShareToken(token)) {
      throw new GroupOrderError("not_found");
    }

    const body = await readSmallJson(req);

    switch (action) {
      case "lines": {
        const name = normalizeParticipantName(body.name);

        if (!isParticipantId(body.participantId) || !name) {
          throw new GroupOrderError("invalid");
        }

        await addGroupLines(token, body.participantId, name, body.lines);
        return ok();
      }
      case "remove": {
        if (!isParticipantId(body.participantId) || typeof body.lineId !== "string" || !UUID.test(body.lineId)) {
          throw new GroupOrderError("invalid");
        }

        await removeGroupLine(token, body.participantId, body.lineId);
        return ok();
      }
      case "lock":
        return ok({ lines: await lockGroup(token, body.organiserToken) });
      case "reopen":
        await reopenGroup(token, body.organiserToken);
        return ok();
      case "complete":
        await completeGroup(token, body.organiserToken, body.orderId);
        return ok();
      default:
        throw new GroupOrderError("not_found");
    }
  } catch (error) {
    return groupErrorResponse(error);
  }
}

// GET /api/group-orders/:token?participant=:id
// The shared group cart for anyone holding the link. Each line says only
// whose name it is under and whether it is the viewer's own (so they may
// remove it); participant ids are never revealed.

import { NextRequest, NextResponse } from "next/server";
import { isParticipantId, isShareToken } from "@/lib/group-order";
import { GroupOrderError, getGroupView } from "@/lib/group-order-data";
import { groupErrorResponse } from "@/lib/group-order-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  const { token } = await params;
  const participant = req.nextUrl.searchParams.get("participant");

  try {
    if (!isShareToken(token)) {
      throw new GroupOrderError("not_found");
    }

    const view = await getGroupView(token, isParticipantId(participant) ? participant : null);
    return NextResponse.json(view, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return groupErrorResponse(error);
  }
}

// POST /api/rider/action { token, action, tenderedAmount?, method?, reason? }
// Called by the rider's job page: picked up, delivered (with the cash
// received) or could-not-deliver. The token is the secret from the rider's
// WhatsApp link (stored only as a hash). The RPC re-checks the assignment,
// locks the order and records the payment actually collected.

import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { friendlyRiderActionError, parseRiderActionBody } from "@/lib/rider-cash";
import { runRiderAction } from "@/lib/rider-job-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(req: NextRequest): Promise<NextResponse> {
  let parsed: ReturnType<typeof parseRiderActionBody>;

  try {
    const text = await req.text();

    if (text.length > 2048) {
      return NextResponse.json({ error: "invalid" }, { status: 400, headers });
    }

    parsed = parseRiderActionBody(JSON.parse(text));
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400, headers });
  }

  if (!parsed) {
    return NextResponse.json({ error: "invalid" }, { status: 400, headers });
  }

  try {
    const outcome = await runRiderAction(parsed);

    if (outcome.status === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers });
    }

    if (outcome.status === "rejected") {
      return NextResponse.json(
        { error: "rejected", message: friendlyRiderActionError(outcome.message) },
        { status: 409, headers }
      );
    }

    revalidatePath("/admin/orders");
    return NextResponse.json({ state: outcome.state, changeDue: outcome.changeDue }, { headers });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers });
  }
}

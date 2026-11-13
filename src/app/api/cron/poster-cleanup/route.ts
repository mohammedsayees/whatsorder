import { NextResponse } from "next/server";

import { POSTER_RETENTION_DAYS } from "@/lib/poster/limits";
import { POSTER_BUCKET } from "@/lib/poster/types";
import { getSupabaseAdmin } from "@/lib/supabase";

// Poster retention: delete posters that were only ever rendered (never sent)
// and are older than POSTER_RETENTION_DAYS, then their PNGs. Posters with
// any marketing_sends row are never deleted — the SQL function excludes them
// and the ON DELETE RESTRICT FK backs that up. Guarded by CRON_SECRET like
// the other crons; fails closed if the secret is unset.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH_SIZE = 500;
const MAX_BATCHES = 4;
// Storage remove() takes a list; keep each call modest.
const STORAGE_CHUNK = 100;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  let deleted = 0;
  let objectsRemoved = 0;
  let objectErrors = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const { data, error } = await supabase.rpc("delete_expired_rendered_posters", {
      older_than_days: POSTER_RETENTION_DAYS,
      max_rows: BATCH_SIZE
    });
    if (error) {
      console.error("WhatsOrder poster cleanup failed", { code: error.code });
      return NextResponse.json(
        { ok: false, error: "Poster cleanup failed.", deleted, objectsRemoved },
        { status: 500 }
      );
    }
    const rows = (data ?? []) as { restaurant_id: string; storage_path: string }[];
    deleted += rows.length;

    // Every object sits under its own restaurant's prefix; never remove a
    // path that doesn't match the row it came from.
    const paths = rows
      .filter((row) => row.storage_path?.startsWith(`${row.restaurant_id}/`))
      .map((row) => row.storage_path);
    for (let index = 0; index < paths.length; index += STORAGE_CHUNK) {
      const chunk = paths.slice(index, index + STORAGE_CHUNK);
      const { error: removeError } = await supabase.storage.from(POSTER_BUCKET).remove(chunk);
      if (removeError) {
        objectErrors += chunk.length;
        console.error("WhatsOrder poster cleanup: object removal failed", {
          message: removeError.message
        });
      } else {
        objectsRemoved += chunk.length;
      }
    }

    if (rows.length < BATCH_SIZE) {
      break;
    }
  }

  return NextResponse.json({ ok: true, deleted, objectsRemoved, objectErrors });
}

export async function GET(request: Request) {
  return handle(request);
}

// Vercel cron uses GET; POST is accepted for manual operator triggers.
export async function POST(request: Request) {
  return handle(request);
}

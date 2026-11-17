import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  GROUP_LIMITS,
  GROUP_TTL_MINUTES,
  type GroupLine,
  type GroupStatus
} from "@/lib/group-order";
import { getOrderPushAuthorization } from "@/lib/push-auth";
import { parseAndValidateCart } from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { CartLine } from "@/lib/types";

// Server side of office group orders. Every function looks the group up by
// its share token and scopes every read/write by that group's own id and
// restaurant_id; the client never chooses the restaurant after creation.

type GroupRow = {
  id: string;
  restaurant_id: string;
  organiser_token_hash: string;
  organiser_name: string;
  status: GroupStatus;
  order_id: string | null;
  expires_at: string;
};

export type GroupView = {
  status: GroupStatus | "expired";
  organiserName: string;
  restaurantId: string;
  expiresAt: string;
  participantCount: number;
  lines: GroupLine[];
};

export class GroupOrderError extends Error {
  constructor(
    readonly code:
      | "unavailable"
      | "not_found"
      | "closed"
      | "forbidden"
      | "invalid"
      | "too_many",
    message = code
  ) {
    super(message);
  }
}

const MAX_GROUPS_PER_RESTAURANT_PER_HOUR = 60;

export function newSecret(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

export function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function secretMatches(secret: unknown, expectedHash: string) {
  if (typeof secret !== "string" || secret.length < 22 || secret.length > 64) {
    return false;
  }

  const actual = Buffer.from(hashSecret(secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function admin() {
  const client = getSupabaseAdmin();

  if (!client) {
    throw new GroupOrderError("unavailable");
  }

  return client;
}

function isExpired(group: GroupRow, now = new Date()) {
  return group.status !== "ordered" && Date.parse(group.expires_at) <= now.getTime();
}

async function findGroup(shareToken: string): Promise<GroupRow> {
  const { data, error } = await admin()
    .from("group_carts")
    .select("id,restaurant_id,organiser_token_hash,organiser_name,status,order_id,expires_at")
    .eq("share_token", shareToken)
    .maybeSingle();

  if (error) {
    throw new GroupOrderError("unavailable");
  }

  if (!data) {
    throw new GroupOrderError("not_found");
  }

  return data as GroupRow;
}

async function readLines(group: GroupRow) {
  const { data, error } = await admin()
    .from("group_cart_lines")
    .select("id,participant_id,participant_name,line")
    .eq("group_cart_id", group.id)
    .eq("restaurant_id", group.restaurant_id)
    .order("created_at", { ascending: true })
    .limit(GROUP_LIMITS.lines);

  if (error) {
    throw new GroupOrderError("unavailable");
  }

  return (data ?? []) as {
    id: string;
    participant_id: string;
    participant_name: string;
    line: CartLine;
  }[];
}

export async function createGroup(restaurantId: string, organiserName: string) {
  const client = admin();
  const { data: restaurant, error } = await client
    .from("restaurants")
    .select("id")
    .eq("id", restaurantId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new GroupOrderError("unavailable");
  }

  if (!restaurant) {
    throw new GroupOrderError("not_found");
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await client
    .from("group_carts")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .gte("created_at", hourAgo);

  if ((count ?? 0) >= MAX_GROUPS_PER_RESTAURANT_PER_HOUR) {
    throw new GroupOrderError("too_many");
  }

  // Housekeeping: groups (and, by cascade, the first names in them) are not
  // kept beyond a day after they expire.
  await client
    .from("group_carts")
    .delete()
    .eq("restaurant_id", restaurantId)
    .lt("expires_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const shareToken = newSecret();
  const organiserToken = newSecret();
  const { error: insertError } = await client.from("group_carts").insert({
    restaurant_id: restaurantId,
    share_token: shareToken,
    organiser_token_hash: hashSecret(organiserToken),
    organiser_name: organiserName,
    expires_at: new Date(Date.now() + GROUP_TTL_MINUTES * 60 * 1000).toISOString()
  });

  if (insertError) {
    throw new GroupOrderError("unavailable");
  }

  return { shareToken, organiserToken };
}

export async function getGroupView(shareToken: string, participantId: string | null): Promise<GroupView> {
  const group = await findGroup(shareToken);
  const rows = await readLines(group);

  return {
    status: isExpired(group) ? "expired" : group.status,
    organiserName: group.organiser_name,
    restaurantId: group.restaurant_id,
    expiresAt: group.expires_at,
    participantCount: new Set(rows.map((row) => row.participant_id)).size,
    // Participant ids stay private so nobody can remove someone else's items.
    lines: rows.map((row) => ({
      id: row.id,
      participant_name: row.participant_name,
      line: row.line,
      mine: participantId !== null && row.participant_id === participantId
    }))
  };
}

export async function addGroupLines(
  shareToken: string,
  participantId: string,
  participantName: string,
  lines: unknown
) {
  const group = await findGroup(shareToken);

  if (group.status !== "open" || isExpired(group)) {
    throw new GroupOrderError("closed");
  }

  const submitted = Array.isArray(lines) ? lines : [];

  if (submitted.length === 0 || submitted.length > GROUP_LIMITS.linesPerSubmission) {
    throw new GroupOrderError("invalid");
  }

  // Same shape checks as checkout; prices are re-checked when the order is
  // created, exactly as for a normal cart.
  const valid = parseAndValidateCart(JSON.stringify(submitted));

  if (valid.length !== submitted.length) {
    throw new GroupOrderError("invalid");
  }

  const existing = await readLines(group);
  const people = new Set(existing.map((row) => row.participant_id));
  people.add(participantId);

  if (existing.length + valid.length > GROUP_LIMITS.lines || people.size > GROUP_LIMITS.participants) {
    throw new GroupOrderError("too_many");
  }

  const { error } = await admin()
    .from("group_cart_lines")
    .insert(
      valid.map((line) => ({
        group_cart_id: group.id,
        restaurant_id: group.restaurant_id,
        participant_id: participantId,
        participant_name: participantName,
        line
      }))
    );

  if (error) {
    throw new GroupOrderError("unavailable");
  }
}

export async function removeGroupLine(shareToken: string, participantId: string, lineId: string) {
  const group = await findGroup(shareToken);

  if (group.status !== "open" || isExpired(group)) {
    throw new GroupOrderError("closed");
  }

  const { error } = await admin()
    .from("group_cart_lines")
    .delete()
    .eq("group_cart_id", group.id)
    .eq("restaurant_id", group.restaurant_id)
    .eq("participant_id", participantId)
    .eq("id", lineId);

  if (error) {
    throw new GroupOrderError("unavailable");
  }
}

async function requireOrganiser(shareToken: string, organiserToken: unknown) {
  const group = await findGroup(shareToken);

  if (!secretMatches(organiserToken, group.organiser_token_hash)) {
    throw new GroupOrderError("forbidden");
  }

  return group;
}

async function setStatus(group: GroupRow, status: GroupStatus, extra: Record<string, unknown> = {}) {
  const { error } = await admin()
    .from("group_carts")
    .update({ status, ...extra })
    .eq("id", group.id)
    .eq("restaurant_id", group.restaurant_id);

  if (error) {
    throw new GroupOrderError("unavailable");
  }
}

/** Stops new items and hands every line to the organiser's checkout. */
export async function lockGroup(shareToken: string, organiserToken: unknown) {
  const group = await requireOrganiser(shareToken, organiserToken);

  if (group.status === "ordered" || isExpired(group)) {
    throw new GroupOrderError("closed");
  }

  await setStatus(group, "locked");
  const rows = await readLines(group);
  return rows.map((row) => ({ participant_name: row.participant_name, line: row.line }));
}

/** Lets people add items again if the organiser went back from checkout. */
export async function reopenGroup(shareToken: string, organiserToken: unknown) {
  const group = await requireOrganiser(shareToken, organiserToken);

  if (group.status !== "locked" || isExpired(group)) {
    throw new GroupOrderError("closed");
  }

  await setStatus(group, "open");
}

/** Marks the group as ordered once the organiser's order is saved. */
export async function completeGroup(shareToken: string, organiserToken: unknown, orderId: unknown) {
  const group = await requireOrganiser(shareToken, organiserToken);

  if (typeof orderId !== "string") {
    throw new GroupOrderError("invalid");
  }

  // The organiser's browser must hold the signed proof for that order, and
  // it must belong to the same restaurant as the group.
  const proof = await getOrderPushAuthorization(orderId);

  if (proof?.orderId !== orderId || proof.restaurantId !== group.restaurant_id) {
    throw new GroupOrderError("forbidden");
  }

  await setStatus(group, "ordered", { order_id: orderId });
}

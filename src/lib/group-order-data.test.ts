import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GroupOrderError,
  addGroupLines,
  completeGroup,
  hashSecret,
  lockGroup,
  removeGroupLine
} from "@/lib/group-order-data";
import { getOrderPushAuthorization } from "@/lib/push-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

vi.mock("@/lib/push-auth", () => ({ getOrderPushAuthorization: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));

const organiserToken = "organiserSecretAAAAAAAAAAAA";
const share = "shareTokenAAAAAAAAAAAAAAAA";
const orderId = "4b000000-0000-4000-8000-000000000001";

type Call = { table: string; op: string; args: unknown[] };

/** Chainable Supabase stand-in: records calls, answers per table/op. */
function mockDb(answers: {
  group?: Record<string, unknown> | null;
  lines?: Record<string, unknown>[];
}) {
  const calls: Call[] = [];

  const from = (table: string) => {
    let op = "select";
    const builder: Record<string, unknown> = {};
    const record = (name: string) =>
      (...args: unknown[]) => {
        if (["select", "update", "delete", "insert"].includes(name) && op === "select") {
          op = name === "select" ? "select" : name;
        }
        calls.push({ table, op, args: [name, ...args] });
        return builder;
      };

    for (const name of ["select", "update", "delete", "insert", "eq", "lt", "gte", "order"]) {
      builder[name] = record(name);
    }

    builder.maybeSingle = async () => ({ data: answers.group ?? null, error: null });
    builder.limit = async () => ({ data: answers.lines ?? [], error: null });
    builder.then = (resolve: (value: unknown) => void) => resolve({ data: null, error: null });
    return builder;
  };

  vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);
  return calls;
}

const openGroup = {
  id: "group-1",
  restaurant_id: "restaurant-a",
  organiser_token_hash: hashSecret(organiserToken),
  organiser_name: "Sara",
  status: "open",
  order_id: null,
  expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
};

const karak = { item_id: "karak", name: "Karak", price: 2, quantity: 1 };

describe("group order server rules", () => {
  beforeEach(() => vi.resetAllMocks());

  it("only removes the caller's own line, inside the group's restaurant", async () => {
    const calls = mockDb({ group: openGroup });
    await removeGroupLine(share, "participantAAAAAAAAA", "line-1");
    const filters = calls
      .filter((call) => call.table === "group_cart_lines" && call.args[0] === "eq")
      .map((call) => call.args.slice(1));
    expect(filters).toEqual([
      ["group_cart_id", "group-1"],
      ["restaurant_id", "restaurant-a"],
      ["participant_id", "participantAAAAAAAAA"],
      ["id", "line-1"]
    ]);
  });

  it("refuses to lock without the organiser secret", async () => {
    mockDb({ group: openGroup });
    await expect(lockGroup(share, "wrongSecretAAAAAAAAAAAAAA")).rejects.toMatchObject({ code: "forbidden" });
    await expect(lockGroup(share, undefined)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("locks with the organiser secret and returns everyone's lines", async () => {
    mockDb({
      group: openGroup,
      lines: [{ id: "l1", participant_id: "p", participant_name: "Ahmed", line: karak }]
    });
    await expect(lockGroup(share, organiserToken)).resolves.toEqual([
      { participant_name: "Ahmed", line: karak }
    ]);
  });

  it("rejects adds to closed or expired groups", async () => {
    mockDb({ group: { ...openGroup, status: "locked" } });
    await expect(addGroupLines(share, "participantAAAAAAAAA", "Ahmed", [karak])).rejects.toMatchObject({ code: "closed" });
    mockDb({ group: { ...openGroup, expires_at: new Date(Date.now() - 1000).toISOString() } });
    await expect(addGroupLines(share, "participantAAAAAAAAA", "Ahmed", [karak])).rejects.toMatchObject({ code: "closed" });
  });

  it("rejects malformed or oversized submissions", async () => {
    mockDb({ group: openGroup });
    await expect(addGroupLines(share, "participantAAAAAAAAA", "Ahmed", [{ item_id: "x" }])).rejects.toMatchObject({ code: "invalid" });
    await expect(addGroupLines(share, "participantAAAAAAAAA", "Ahmed", [])).rejects.toMatchObject({ code: "invalid" });
    await expect(
      addGroupLines(share, "participantAAAAAAAAA", "Ahmed", Array.from({ length: 21 }, () => karak))
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("stops at the people limit", async () => {
    mockDb({
      group: openGroup,
      lines: Array.from({ length: 30 }, (_, i) => ({
        id: `l${i}`,
        participant_id: `participant${String(i).padStart(10, "0")}`,
        participant_name: `P${i}`,
        line: karak
      }))
    });
    await expect(addGroupLines(share, "newcomerAAAAAAAAAAAA", "Late", [karak])).rejects.toMatchObject({ code: "too_many" });
  });

  it("completes only with proof of an order from the same restaurant", async () => {
    mockDb({ group: openGroup });
    vi.mocked(getOrderPushAuthorization).mockResolvedValue({ orderId, restaurantId: "restaurant-b" });
    await expect(completeGroup(share, organiserToken, orderId)).rejects.toMatchObject({ code: "forbidden" });
    vi.mocked(getOrderPushAuthorization).mockResolvedValue(null);
    await expect(completeGroup(share, organiserToken, orderId)).rejects.toMatchObject({ code: "forbidden" });
    vi.mocked(getOrderPushAuthorization).mockResolvedValue({ orderId, restaurantId: "restaurant-a" });
    await expect(completeGroup(share, organiserToken, orderId)).resolves.toBeUndefined();
  });

  it("reports a missing group as not found", async () => {
    mockDb({ group: null });
    await expect(lockGroup(share, organiserToken)).rejects.toBeInstanceOf(GroupOrderError);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildGroupNotes,
  isParticipantId,
  isShareToken,
  mergeGroupLines,
  normalizeParticipantName
} from "@/lib/group-order";
import type { CartLine } from "@/lib/types";

const karak: CartLine = { item_id: "karak", name: "Karak Tea", name_ar: "شاي كرك", price: 2, quantity: 2 };
const zinger: CartLine = {
  item_id: "zinger",
  name: "Zinger",
  price: 12,
  quantity: 1,
  options: [{ group_id: "size", option_id: "l", name: "Large", price_delta: 3 }]
};

describe("identifiers and names", () => {
  it("validates tokens and participant ids", () => {
    expect(isShareToken("a".repeat(22))).toBe(true);
    expect(isShareToken("short")).toBe(false);
    expect(isShareToken("a".repeat(22) + "!")).toBe(false);
    expect(isParticipantId("p".repeat(16))).toBe(true);
    expect(isParticipantId(null)).toBe(false);
  });

  it("keeps names short and single-line", () => {
    expect(normalizeParticipantName("  Priya\nK ")).toBe("Priya K");
    expect(normalizeParticipantName("x".repeat(50))).toHaveLength(30);
    expect(normalizeParticipantName("   ")).toBeNull();
    expect(normalizeParticipantName(5)).toBeNull();
  });
});

describe("mergeGroupLines", () => {
  it("combines identical items across people and keeps different configurations apart", () => {
    const merged = mergeGroupLines([
      { line: karak },
      { line: { ...karak, quantity: 1 } },
      { line: zinger }
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.find((line) => line.item_id === "karak")?.quantity).toBe(3);
  });

  it("respects offer caps when merging", () => {
    const offer = { ...karak, offer_id: "o1", offer_max_quantity: 3, quantity: 2 };
    expect(mergeGroupLines([{ line: offer }, { line: offer }])[0].quantity).toBe(3);
  });
});

describe("buildGroupNotes", () => {
  const lines = [
    { participant_name: "Sara", line: karak },
    { participant_name: "Ahmed", line: zinger },
    { participant_name: "Sara", line: { ...karak, item_id: "chai", name: "Chai", name_ar: null, quantity: 1 } }
  ];

  it("lists each person's items for the kitchen", () => {
    expect(buildGroupNotes(lines, "en")).toBe(
      "Group order (2 people): Sara: 2× Karak Tea, 1× Chai; Ahmed: 1× Zinger (Large)"
    );
  });

  it("uses Arabic item names when available", () => {
    expect(buildGroupNotes(lines, "ar")).toContain("Sara: 2× شاي كرك");
  });

  it("stays within the notes limit", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ participant_name: `Person ${i}`, line: karak }));
    expect(buildGroupNotes(many, "en", 200).length).toBeLessThanOrEqual(200);
  });

  it("is empty without lines", () => {
    expect(buildGroupNotes([], "en")).toBe("");
  });
});

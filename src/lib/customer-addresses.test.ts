import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cleanSavedAddressInput,
  isSameAddress,
  parseSavedAddresses,
  savedAddressSummary
} from "./customer-addresses";

const base = {
  label: "Home",
  area: "Al Nahda",
  building: "Tower 2",
  flat: "1204",
  details: "",
  landmark: "",
  latitude: null,
  longitude: null
};

describe("cleanSavedAddressInput", () => {
  it("trims and keeps a valid address", () => {
    expect(cleanSavedAddressInput({ ...base, label: "  Home  ", area: " Al   Nahda " })).toEqual(base);
  });

  it("needs a label and something to deliver to", () => {
    expect(cleanSavedAddressInput({ ...base, label: " " })).toBeNull();
    expect(cleanSavedAddressInput({ ...base, label: "x".repeat(41) })).toBeNull();
    expect(cleanSavedAddressInput({ label: "Home", area: "", building: "", details: "" })).toBeNull();
    expect(cleanSavedAddressInput(null)).toBeNull();
    expect(cleanSavedAddressInput(["Home"])).toBeNull();
  });

  it("rejects fields over the checkout limits", () => {
    expect(cleanSavedAddressInput({ ...base, flat: "x".repeat(61) })).toBeNull();
    expect(cleanSavedAddressInput({ ...base, landmark: "x".repeat(251) })).toBeNull();
  });

  it("accepts a pin alone, only as a valid pair", () => {
    expect(
      cleanSavedAddressInput({ label: "Pin", latitude: 25.2048493, longitude: 55.2707828 })
    ).toMatchObject({ latitude: 25.2048493, longitude: 55.2707828 });
    expect(cleanSavedAddressInput({ ...base, latitude: 25.2 })).toBeNull();
    expect(cleanSavedAddressInput({ ...base, latitude: 95, longitude: 55 })).toBeNull();
    expect(cleanSavedAddressInput({ ...base, latitude: "abc", longitude: 55 })).toBeNull();
  });

  it("ignores unknown fields", () => {
    const cleaned = cleanSavedAddressInput({ ...base, restaurant_id: "other", is_default: true });
    expect(cleaned).toEqual(base);
  });
});

describe("parseSavedAddresses", () => {
  it("keeps well-formed rows and coerces numeric strings", () => {
    const rows = parseSavedAddresses([
      { id: "a", label: "Home", area: "X", latitude: "25.2", longitude: "55.3", is_default: true },
      { id: "b", label: "Half pin", area: "Y", latitude: 25.2, longitude: null },
      { label: "No id" },
      null
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "a", latitude: 25.2, longitude: 55.3, is_default: true, building: "" });
    expect(rows[1]).toMatchObject({ id: "b", latitude: null, longitude: null, is_default: false });
    expect(parseSavedAddresses("nope")).toEqual([]);
  });
});

describe("matching and summary", () => {
  it("matches addresses regardless of case and spacing", () => {
    expect(isSameAddress(base, { ...base, area: " al nahda " })).toBe(true);
    expect(isSameAddress(base, { ...base, flat: "1205" })).toBe(false);
  });

  it("summarizes the address", () => {
    expect(savedAddressSummary(base)).toBe("Tower 2, 1204, Al Nahda");
  });
});

describe("customer_saved_addresses migration", () => {
  const sql = readFileSync(
    new URL("../../supabase/migrations/20261129090000_customer_saved_addresses.sql", import.meta.url),
    "utf8"
  ).toLowerCase();

  it("ties every address to a customer of the same restaurant", () => {
    expect(sql).toContain("foreign key (customer_id, restaurant_id)\n    references public.customers(id, restaurant_id)");
    expect(sql).toContain("where is_default;");
  });

  it("allows reads to managers only and no browser writes", () => {
    expect(sql).toContain("for select\nto authenticated");
    expect(sql).toContain("array['restaurant_admin', 'owner', 'manager']");
    expect(sql).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/);
    expect(sql).toContain("revoke all on table public.customer_addresses from anon, authenticated;");
    expect(sql).toContain("grant select on table public.customer_addresses to authenticated;");
  });

  it("keeps the RPCs service-role only and invoker rights", () => {
    expect(sql).not.toContain("security definer");
    expect(sql.match(/from public, anon, authenticated/g)?.length).toBe(4);
    expect(sql.match(/to service_role/g)?.length).toBe(4);
  });
});

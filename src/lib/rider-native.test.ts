import { describe, expect, it } from "vitest";
import { RIDER_APP_SCHEME, riderAppDeepLink, riderTokenFromLink } from "@/lib/rider-native";

const token = "AbC_123-".repeat(5); // 40 url-safe characters
const hosts = ["whatsorder.app"];

describe("riderAppDeepLink", () => {
  it("builds the app's own link", () => {
    expect(riderAppDeepLink(token)).toBe(`${RIDER_APP_SCHEME}://rider/${token}`);
  });
});

describe("riderTokenFromLink", () => {
  it("reads the token from the app link, the https link and a padded paste", () => {
    expect(riderTokenFromLink(`whatsorder-rider://rider/${token}`, hosts)).toBe(token);
    expect(riderTokenFromLink(`https://whatsorder.app/rider/${token}`, hosts)).toBe(token);
    expect(riderTokenFromLink(`  https://WhatsOrder.app/rider/${token}/?x=1  `, hosts)).toBe(token);
  });

  it("round-trips the deep link", () => {
    expect(riderTokenFromLink(riderAppDeepLink(token), hosts)).toBe(token);
  });

  it("rejects other hosts, schemes and shapes", () => {
    expect(riderTokenFromLink(`https://evil.example/rider/${token}`, hosts)).toBeNull();
    expect(riderTokenFromLink(`http://whatsorder.app/rider/${token}`, hosts)).toBeNull();
    expect(riderTokenFromLink(`javascript:alert(1)//rider/${token}`, hosts)).toBeNull();
    expect(riderTokenFromLink(`https://whatsorder.app/admin/${token}`, hosts)).toBeNull();
    expect(riderTokenFromLink(`https://whatsorder.app/rider/${token}/extra`, hosts)).toBeNull();
    expect(riderTokenFromLink(`https://whatsorder.app/rider/short`, hosts)).toBeNull();
    expect(riderTokenFromLink(`whatsorder-rider://admin/${token}`, hosts)).toBeNull();
  });

  it("rejects empty, non-URL and oversized input", () => {
    expect(riderTokenFromLink("", hosts)).toBeNull();
    expect(riderTokenFromLink("not a link", hosts)).toBeNull();
    expect(riderTokenFromLink(`https://whatsorder.app/rider/${"a".repeat(500)}`, hosts)).toBeNull();
  });

  it("does not trust a host that merely contains an allowed one", () => {
    expect(riderTokenFromLink(`https://whatsorder.app.evil.example/rider/${token}`, hosts)).toBeNull();
  });
});

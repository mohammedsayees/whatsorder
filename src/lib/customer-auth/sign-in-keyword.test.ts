import { describe, expect, it } from "vitest";
import {
  customerSignInNumber,
  isCustomerSignInKeyword,
  signInReplyMessage,
  SIGN_IN_KEYWORD
} from "./sign-in-keyword";

describe("isCustomerSignInKeyword", () => {
  it("matches the button's keyword and common variants, in English and Arabic", () => {
    for (const text of [SIGN_IN_KEYWORD, "login", " LOGIN! ", "Log in", "sign-in", "My account", "حسابي", "تسجيل الدخول", "‏حسابي‏"]) {
      expect(isCustomerSignInKeyword(text), text).toBe(true);
    }
  });

  it("only matches the whole message", () => {
    for (const text of ["my account shows the wrong order", "login please and 2 karak", "", null, undefined]) {
      expect(isCustomerSignInKeyword(text), String(text)).toBe(false);
    }
  });
});

describe("signInReplyMessage", () => {
  it("names the café and includes the link", () => {
    const reply = signInReplyMessage("Chai Xpress", "https://app.test/link");
    expect(reply).toContain("Chai Xpress");
    expect(reply).toContain("https://app.test/link");
    expect(reply).toContain("10 minutes");
  });
});

describe("customerSignInNumber", () => {
  const web = { provider: "whatsapp_web", status: "active", phone_number: "971500001418" };

  it("prefers the café's active WhatsApp Web connector", () => {
    expect(customerSignInNumber({ integration: web, ownsCloudNumber: true, whatsappNumber: "971500009999" })).toBe(
      "971500001418"
    );
  });

  it("falls back to the Cloud number only for the café that owns it", () => {
    const disconnected = { ...web, status: "disconnected" };
    expect(customerSignInNumber({ integration: disconnected, ownsCloudNumber: true, whatsappNumber: "971500009999" })).toBe(
      "971500009999"
    );
    expect(customerSignInNumber({ integration: disconnected, ownsCloudNumber: false, whatsappNumber: "971500009999" })).toBeNull();
    expect(customerSignInNumber({ integration: null, ownsCloudNumber: false, whatsappNumber: null })).toBeNull();
  });
});

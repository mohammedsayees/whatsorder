import { describe, expect, it } from "vitest";
import {
  canReceiveOwnerLoginLink,
  isOwnerWhatsAppLinkEnabled,
  ownerWhatsAppLoginMode
} from "./config";

const ready = {
  OWNER_WHATSAPP_LOGIN: "step1",
  WHATSAPP_ACCESS_TOKEN: "token",
  WHATSAPP_PHONE_NUMBER_ID: "123",
  SUPABASE_SEND_SMS_HOOK_SECRET: "v1,whsec_abc"
};

describe("owner WhatsApp login flag", () => {
  it("is off unless set to a known step", () => {
    expect(ownerWhatsAppLoginMode({})).toBe("off");
    expect(ownerWhatsAppLoginMode({ OWNER_WHATSAPP_LOGIN: "yes" })).toBe("off");
    expect(ownerWhatsAppLoginMode({ OWNER_WHATSAPP_LOGIN: " Step1 " })).toBe("step1");
    expect(ownerWhatsAppLoginMode({ OWNER_WHATSAPP_LOGIN: "step2" })).toBe("step2");
  });

  it("sends links only when the flag, WhatsApp and the hook secret are all set", () => {
    expect(isOwnerWhatsAppLinkEnabled(ready)).toBe(true);
    for (const key of Object.keys(ready)) {
      expect(isOwnerWhatsAppLinkEnabled({ ...ready, [key]: undefined })).toBe(false);
    }
    expect(isOwnerWhatsAppLinkEnabled({ ...ready, OWNER_WHATSAPP_LOGIN: "off" })).toBe(false);
  });

  it("limits login links to owners and managers", () => {
    expect(canReceiveOwnerLoginLink("restaurant_admin")).toBe(true);
    expect(canReceiveOwnerLoginLink("owner")).toBe(true);
    expect(canReceiveOwnerLoginLink("manager")).toBe(true);
    expect(canReceiveOwnerLoginLink("staff")).toBe(false);
    expect(canReceiveOwnerLoginLink("super_admin")).toBe(false);
  });
});

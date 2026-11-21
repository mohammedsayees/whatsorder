import { describe, expect, it } from "vitest";
import {
  canReceiveOwnerLoginLink,
  isOwnerWhatsAppCodeEnabled,
  isOwnerWhatsAppLinkEnabled,
  ownerLoginSenderRestaurantId,
  ownerWhatsAppLoginMode
} from "./config";

const ready = {
  OWNER_WHATSAPP_LOGIN: "step1",
  OWNER_LOGIN_SENDER_RESTAURANT_ID: "55555555-5555-4555-8555-555555555555",
  WHATSAPP_WEB_CONNECTOR_URL: "https://connector.example",
  WHATSAPP_WEB_CONNECTOR_SECRET: "secret",
  SUPABASE_SEND_SMS_HOOK_SECRET: "v1,whsec_abc"
};

describe("owner WhatsApp login flag", () => {
  it("is off unless set to a known step", () => {
    expect(ownerWhatsAppLoginMode({})).toBe("off");
    expect(ownerWhatsAppLoginMode({ OWNER_WHATSAPP_LOGIN: "yes" })).toBe("off");
    expect(ownerWhatsAppLoginMode({ OWNER_WHATSAPP_LOGIN: " Step1 " })).toBe("step1");
    expect(ownerWhatsAppLoginMode({ OWNER_WHATSAPP_LOGIN: "step2" })).toBe("step2");
  });

  it("needs a valid sender restaurant id", () => {
    expect(ownerLoginSenderRestaurantId(ready)).toBe("55555555-5555-4555-8555-555555555555");
    expect(ownerLoginSenderRestaurantId({ OWNER_LOGIN_SENDER_RESTAURANT_ID: "chaixpress" })).toBeNull();
    expect(isOwnerWhatsAppLinkEnabled({ ...ready, OWNER_LOGIN_SENDER_RESTAURANT_ID: "chaixpress" })).toBe(false);
  });

  it("sends links only when the flag, the web connector, the sender and the hook secret are all set", () => {
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

  it("offers phone + code login only in step 2 with everything configured", () => {
    expect(isOwnerWhatsAppCodeEnabled(ready)).toBe(false);
    expect(isOwnerWhatsAppCodeEnabled({ ...ready, OWNER_WHATSAPP_LOGIN: "step2" })).toBe(true);
    expect(
      isOwnerWhatsAppCodeEnabled({ ...ready, OWNER_WHATSAPP_LOGIN: "step2", SUPABASE_SEND_SMS_HOOK_SECRET: undefined })
    ).toBe(false);
  });
});

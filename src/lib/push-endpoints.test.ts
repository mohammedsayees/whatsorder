import { describe, expect, it } from "vitest";

import { isAllowedPushEndpoint } from "./push-endpoints";

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:APA91b",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://web.push.apple.com/QGuQyavXutnMH",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
    "https://api.push.apple.com/3/device/abc"
  ])("allows the browser push service %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "https://attacker.example/collect",
    "https://fcm.googleapis.com.attacker.example/x",
    "https://evilnotify.windows.com/x",
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:8443/fcm/send/abc",
    "https://user:pw@fcm.googleapis.com/fcm/send/abc",
    "https://169.254.169.254/latest/meta-data",
    "not a url",
    42
  ])("rejects %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});

import type { CapacitorConfig } from "@capacitor/cli";

// The app is a thin native shell around the rider pages on the live site, so
// UI fixes ship with a normal deploy and never need a store release. The
// native parts are the background location service and the
// `whatsorder-rider://` link handler (see scripts/configure-native.mjs).
//
// RIDER_APP_URL points the shell at another environment, e.g. a preview:
//   RIDER_APP_URL=https://preview.example.com/rider-app npx cap sync
const startUrl = process.env.RIDER_APP_URL ?? "https://whatsorder.app/rider-app";
const host = new URL(startUrl).host;

const config: CapacitorConfig = {
  appId: "app.whatsorder.rider",
  appName: "WhatsOrder Rider",
  webDir: "www",
  server: {
    url: startUrl,
    cleartext: false,
    // Only our own site may load in the app (and use the native plugins).
    allowNavigation: [host]
  },
  android: {
    allowMixedContent: false
  },
  ios: {
    contentInset: "always"
  }
};

export default config;

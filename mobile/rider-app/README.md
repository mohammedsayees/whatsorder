# WhatsOrder Rider app

A thin Capacitor shell around the rider pages (`/rider-app`, `/rider/<token>`). The only reason it exists is **background location**: a browser tab stops sharing GPS when the rider switches to Google Maps or locks the phone, the app does not.

- The UI is the live website (`server.url`), so UI fixes ship with a normal deploy, never a store release.
- Native parts: the background location service (`@capacitor-community/background-geolocation`), the `whatsorder-rider://` link handler, and the location permission texts.
- It keeps using the existing endpoints (`/api/rider/location`, `/api/rider/action`) and the per-order link token. No new server code.
- It is not part of the root `npm` project: root typecheck/lint/tests ignore `mobile/`.

## How a rider uses it

1. Restaurant assigns the order → rider gets the WhatsApp message with their delivery link.
2. Rider taps the link (opens in the browser) → taps **Open in the app** (or pastes the link into the app's start screen).
3. In the app: **Picked up → Start sharing location → Navigate** (opens Google/Apple Maps). Sharing continues in the background.
4. **Delivered** (cash/card, change shown) or **Couldn't deliver**. Sharing stops by itself.

## Build

Prerequisites: Node 22. Android: Android Studio (JDK 21, Android SDK 36). iOS: a Mac with Xcode (no CocoaPods, it uses Swift Package Manager).

```bash
cd mobile/rider-app
npm install
npm run android   # sync + apply native settings + open Android Studio
npm run ios       # same for Xcode (macOS only)
```

`npm run configure` re-applies the native settings (custom link scheme, iOS location keys and background mode, Android notification text). It is idempotent and runs automatically in the scripts above. Run it after `npx cap add` or after upgrading Capacitor.

Point a build at another environment (preview/staging) with:

```bash
RIDER_APP_URL=https://your-preview.vercel.app/rider-app npx cap sync
```

The app only loads the host of that URL (`allowNavigation`). The website serves it over https only.

## Distribute (employees, no public listing needed)

- **Android:** Android Studio → Build → Generate Signed Bundle/APK. Share the APK directly, or use Google Play **Internal testing** (needs a Play Console account, US$25 once).
- **iOS:** needs an Apple Developer account (US$99/year). Distribute with **TestFlight** (up to 10,000 testers, builds expire after 90 days) or as an **unlisted/custom app**. A thin web wrapper can be rejected from the public App Store (guideline 4.2); background location is the justification, say so in review notes: *"Delivery riders share their live location with the restaurant and customer during an active delivery."*

Keep `versionCode`/build number increasing per upload.

## Permissions the rider must grant

- **Location → Always** (iOS: "Always", Android: "Allow all the time"), otherwise sharing stops when the screen locks.
- **Notifications** (Android 13+): the always-on "WhatsOrder Rider" notice. Tracking still runs if denied, the notice is just hidden.
- On some Android phones (Xiaomi, Oppo, Samsung power saving) set the app's battery use to **Unrestricted**, or the system may stop the service.

## Not done yet / to decide

- **App Links / Universal Links** (so tapping the WhatsApp link opens the app directly, skipping the "Open in the app" button). Needs `/.well-known/assetlinks.json` (Android signing SHA-256) and `apple-app-site-association` (Apple team ID) served from the site, plus the matching intent-filter / Associated Domains entry. Do this once signing keys exist.
- **App icon and splash** are the Capacitor defaults. Add real artwork (`@capacitor/assets` generates all sizes from one image).
- **Rider login** (per-rider accounts, on/off duty for part-timers). The app still works from per-order links.
- **Stationary riders:** the plugin reports when the rider moves ≥ 15 m, so a rider waiting at the restaurant shows "last seen" on the admin board until they move.

## Verification status

Android and iOS projects were generated and the native settings applied and validated (XML/plist parse, idempotent). They have **not been compiled or run on a device** (no Android SDK or Xcode where this was written). Before a pilot: build both, install on a real phone, start a delivery with a test order, switch to Maps, lock the screen, and confirm the admin Riders board keeps updating.

// Applies the native settings the rider app needs on top of what
// `cap add/sync` generates. Safe to run repeatedly (each edit checks first).
//
//   npm run configure
//
// Android: whatsorder-rider:// link handler, notification channel name.
// iOS:     whatsorder-rider:// URL scheme, location usage text, background
//          location mode (the plugin README lists the same keys).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEME = "whatsorder-rider";
const changed = [];

function patch(file, label, edit) {
  const path = join(root, file);

  if (!existsSync(path)) {
    console.log(`skip   ${file} (platform not added)`);
    return;
  }

  const before = readFileSync(path, "utf8");
  const after = edit(before);

  if (after === before) {
    console.log(`ok     ${label} (already set)`);
    return;
  }

  writeFileSync(path, after);
  changed.push(label);
  console.log(`patch  ${label}`);
}

// ---- Android ---------------------------------------------------------------

patch("android/app/src/main/AndroidManifest.xml", "Android: custom link handler", (xml) => {
  if (xml.includes(`android:scheme="${SCHEME}"`)) {
    return xml;
  }

  const filter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${SCHEME}" />
            </intent-filter>
`;
  const marker = "        </activity>";

  if (!xml.includes(marker)) {
    throw new Error("AndroidManifest.xml: MainActivity closing tag not found");
  }

  return xml.replace(marker, `${filter}${marker}`);
});

patch("android/app/src/main/res/values/strings.xml", "Android: location notification text", (xml) => {
  if (xml.includes("capacitor_background_geolocation_notification_channel_name")) {
    return xml;
  }

  return xml.replace(
    "</resources>",
    `    <!-- Shown in the notification settings for the always-on location notice. -->
    <string name="capacitor_background_geolocation_notification_channel_name">Delivery location</string>
</resources>`
  );
});

// ---- iOS -------------------------------------------------------------------

patch("ios/App/App/Info.plist", "iOS: URL scheme, location text, background mode", (plist) => {
  const additions = [];

  if (!plist.includes(`<string>${SCHEME}</string>`)) {
    additions.push(`	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLName</key>
			<string>app.whatsorder.rider</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>${SCHEME}</string>
			</array>
		</dict>
	</array>`);
  }

  if (!plist.includes("NSLocationWhenInUseUsageDescription")) {
    additions.push(`	<key>NSLocationWhenInUseUsageDescription</key>
	<string>WhatsOrder Rider shares your location with the restaurant and the customer while you deliver an order.</string>`);
  }

  if (!plist.includes("NSLocationAlwaysAndWhenInUseUsageDescription")) {
    additions.push(`	<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
	<string>Choose Always so the customer can follow your delivery while you use your maps app or your screen is locked. Location is shared only during a delivery.</string>`);
  }

  if (!plist.includes("UIBackgroundModes")) {
    additions.push(`	<key>UIBackgroundModes</key>
	<array>
		<string>location</string>
	</array>`);
  }

  if (additions.length === 0) {
    return plist;
  }

  const end = plist.lastIndexOf("</dict>");

  if (end === -1) {
    throw new Error("Info.plist: root dict not found");
  }

  return `${plist.slice(0, end)}${additions.join("\n")}\n${plist.slice(end)}`;
});

console.log(changed.length ? `\n${changed.length} change(s) applied.` : "\nNothing to change.");

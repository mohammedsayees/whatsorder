import { RIDER_TOKEN_PATTERN } from "@/lib/rider-location";

// Helpers for the WhatsOrder Rider app (a Capacitor shell around the rider
// pages). Pure functions are unit-tested; the Capacitor loaders only run
// inside the app, so browsers never download @capacitor/core.

export const RIDER_APP_SCHEME = "whatsorder-rider";

/** `whatsorder-rider://rider/<token>`: opens the app from the WhatsApp link page. */
export function riderAppDeepLink(token: string) {
  return `${RIDER_APP_SCHEME}://rider/${token}`;
}

/**
 * The delivery token inside a link the rider opened or pasted. Accepts the
 * app's own scheme and the https link from WhatsApp (any host listed in
 * `allowedHosts`); anything else is rejected.
 */
export function riderTokenFromLink(link: string, allowedHosts: readonly string[]): string | null {
  const trimmed = link.trim();

  if (!trimmed || trimmed.length > 400) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  let segments: string[];

  if (url.protocol === `${RIDER_APP_SCHEME}:`) {
    // whatsorder-rider://rider/<token>: "rider" parses as the host.
    segments = [url.host, ...url.pathname.split("/")].filter(Boolean);
  } else if (url.protocol === "https:" && allowedHosts.includes(url.host.toLowerCase())) {
    segments = url.pathname.split("/").filter(Boolean);
  } else {
    return null;
  }

  if (segments.length !== 2 || segments[0] !== "rider") {
    return null;
  }

  return RIDER_TOKEN_PATTERN.test(segments[1]) ? segments[1] : null;
}

type CapacitorGlobal = { isNativePlatform?: () => boolean };

/** True inside the installed rider app (the native bridge sets window.Capacitor). */
export function isRiderApp() {
  if (typeof window === "undefined") {
    return false;
  }

  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor?.isNativePlatform?.() === true;
}

export type NativeFix = { latitude: number; longitude: number; accuracy: number | null };

type BackgroundGeolocationPlugin = {
  addWatcher(
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (
      location?: { latitude: number; longitude: number; accuracy: number },
      error?: { code?: string; message?: string }
    ) => void
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
};

type AppPlugin = {
  getLaunchUrl(): Promise<{ url: string } | undefined>;
  addListener(
    event: "appUrlOpen",
    listener: (event: { url: string }) => void
  ): Promise<{ remove: () => Promise<void> }>;
};

/**
 * Starts background location in the app: Android keeps a foreground-service
 * notification, iOS uses the "location" background mode, so fixes keep
 * arriving while the rider is in Google Maps or the screen is locked.
 * Returns a function that stops it.
 */
export async function startNativeTracking(
  onFix: (fix: NativeFix) => void,
  onProblem: (problem: "permission_denied" | "unavailable") => void
): Promise<() => Promise<void>> {
  const { registerPlugin } = await import("@capacitor/core");
  const plugin = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

  const id = await plugin.addWatcher(
    {
      backgroundMessage: "Sharing your location while you deliver.",
      backgroundTitle: "WhatsOrder Rider",
      distanceFilter: 15,
      requestPermissions: true,
      stale: false
    },
    (location, error) => {
      if (error) {
        onProblem(error.code === "NOT_AUTHORIZED" ? "permission_denied" : "unavailable");
        return;
      }

      if (location) {
        onFix({
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: Number.isFinite(location.accuracy) ? location.accuracy : null
        });
      }
    }
  );

  return () => plugin.removeWatcher({ id });
}

export async function openNativeLocationSettings() {
  const { registerPlugin } = await import("@capacitor/core");
  await registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation").openSettings();
}

/**
 * Calls `onLink` with the URL that launched the app and with every link
 * opened later (e.g. tapping a WhatsApp delivery link while the app is open).
 */
export async function watchAppLinks(onLink: (url: string) => void): Promise<() => void> {
  const { registerPlugin } = await import("@capacitor/core");
  const app = registerPlugin<AppPlugin>("App");
  const launch = await app.getLaunchUrl().catch(() => undefined);

  if (launch?.url) {
    onLink(launch.url);
  }

  const handle = await app.addListener("appUrlOpen", (event) => onLink(event.url));
  return () => void handle.remove();
}

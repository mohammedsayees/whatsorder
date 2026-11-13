import "server-only";

import QRCode from "qrcode";

function publicAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  if (configured) {
    return configured;
  }

  const vercelUrl =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

  return vercelUrl ? `https://${vercelUrl}` : "http://localhost:3000";
}

/** PNG data URL of a QR code for `url` (shared by the share kit and posters). */
export function qrCodeDataUrl(
  url: string,
  options: { width?: number; dark?: string; light?: string; margin?: number } = {}
): Promise<string> {
  return QRCode.toDataURL(url, {
    width: options.width ?? 720,
    margin: options.margin ?? 2,
    errorCorrectionLevel: "M",
    color: { dark: options.dark ?? "#17201b", light: options.light ?? "#ffffff" }
  });
}

export async function getStoreShareAssets(restaurantSlug: string) {
  const menuUrl = `${publicAppUrl()}/r/${restaurantSlug}`;
  const qrDataUrl = await qrCodeDataUrl(menuUrl);

  return { menuUrl, qrDataUrl };
}

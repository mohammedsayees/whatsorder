import "server-only";

import QRCode from "qrcode";

import { STORE_SHARE_SOURCES, withAttributionSource } from "@/lib/attribution";

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

export async function getStoreShareAssets(
  restaurantSlug: string,
  options: { qrSource?: string } = {}
) {
  const menuUrl = `${publicAppUrl()}/r/${restaurantSlug}`;
  // Each share channel carries its own ?src= so orders can be attributed;
  // menuUrl stays clean for display on the printed counter card.
  const linkUrl = withAttributionSource(menuUrl, STORE_SHARE_SOURCES.link);
  const whatsappShareUrl = withAttributionSource(menuUrl, STORE_SHARE_SOURCES.whatsapp);
  const qrDataUrl = await qrCodeDataUrl(
    withAttributionSource(menuUrl, options.qrSource ?? STORE_SHARE_SOURCES.qr)
  );

  return { menuUrl, linkUrl, whatsappShareUrl, qrDataUrl };
}

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

export async function getStoreShareAssets(restaurantSlug: string) {
  const menuUrl = `${publicAppUrl()}/r/${restaurantSlug}`;
  const qrDataUrl = await QRCode.toDataURL(menuUrl, {
    width: 720,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#17201b", light: "#ffffff" }
  });

  return { menuUrl, qrDataUrl };
}

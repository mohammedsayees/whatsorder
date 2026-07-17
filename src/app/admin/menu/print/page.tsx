import QRCode from "qrcode";
import { MenuPrintDesigner } from "@/components/admin/MenuPrintDesigner";
import { getMenu } from "@/lib/data";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

function publicAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  if (configured) {
    return configured;
  }

  const vercelUrl =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

  return vercelUrl ? `https://${vercelUrl}` : "http://localhost:3000";
}

export default async function PrintMenuPage() {
  const { restaurant } = await requireRestaurantAdmin();
  const menu = await getMenu(restaurant.id, { admin: true });
  const menuUrl = `${publicAppUrl()}/r/${restaurant.slug}`;
  const qrDataUrl = await QRCode.toDataURL(menuUrl, {
    width: 360,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#17201b", light: "#ffffff" }
  });

  return (
    <MenuPrintDesigner
      categories={menu.categories}
      items={menu.items}
      menuUrl={menuUrl}
      qrDataUrl={qrDataUrl}
      restaurant={restaurant}
    />
  );
}

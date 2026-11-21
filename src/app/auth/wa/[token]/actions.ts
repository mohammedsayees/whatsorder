"use server";

import { redirect } from "next/navigation";
import { resolveRestaurantAdminSession } from "@/lib/super-admin-auth";
import { parseOwnerLoginLinkToken } from "@/lib/owner-whatsapp-login/link-token";
import { redeemOwnerLoginLink } from "@/lib/owner-whatsapp-login/server";
import { setOwnerWhatsAppSessionCookies } from "@/lib/owner-whatsapp-login/session-cookies";

// POST-only on purpose: link previews and security scanners that open the
// WhatsApp link with a GET must not use up the one-time login.
export async function redeemOwnerWhatsAppLinkAction(formData: FormData) {
  const parsed = parseOwnerLoginLinkToken(String(formData.get("token") ?? ""));
  if (!parsed) {
    redirect("/auth/wa/link-expired");
  }

  const result = await redeemOwnerLoginLink(parsed.requestId, parsed.code);
  if (!result.ok) {
    redirect("/auth/wa/link-expired");
  }

  await setOwnerWhatsAppSessionCookies(result);

  const resolution = await resolveRestaurantAdminSession();
  if (resolution.issue === "restaurant_selection_required") {
    redirect("/select-restaurant");
  }
  if (!resolution.session) {
    redirect("/admin-login?error=" + encodeURIComponent("Signed in, but this login is not linked to an active restaurant. Contact WhatsOrder support."));
  }
  redirect("/admin?signed_in=whatsapp");
}

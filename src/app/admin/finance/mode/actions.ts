"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { canUseAdvancedFinance, FINANCE_MODE_COOKIE } from "@/lib/finance-simple";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

export async function setFinanceModeAction(formData: FormData) {
  const session = await requireRestaurantAdmin();
  const advanced = formData.get("mode") === "advanced" && canUseAdvancedFinance(session.role);
  const store = await cookies();
  if (advanced) {
    store.set(FINANCE_MODE_COOKIE, "advanced", {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/admin/finance", maxAge: 60 * 60 * 24 * 365
    });
  } else {
    store.delete({ name: FINANCE_MODE_COOKIE, path: "/admin/finance" });
  }
  redirect("/admin/finance");
}

import "server-only";

import { cookies } from "next/headers";
import { FINANCE_MODE_COOKIE, resolveFinanceMode, type FinanceMode } from "@/lib/finance-simple";
import type { RestaurantAdminSession } from "@/lib/super-admin-auth";

/** Simple mode for everyone; owners and admins may opt into the advanced view. */
export async function getFinanceMode(session: RestaurantAdminSession): Promise<FinanceMode> {
  const store = await cookies();
  return resolveFinanceMode(session.role, store.get(FINANCE_MODE_COOKIE)?.value);
}

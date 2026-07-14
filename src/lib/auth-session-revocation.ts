import "server-only";

import { cookies } from "next/headers";
import { getSupabase } from "@/lib/supabase";
import {
  refreshTokenCookieName,
  superAdminCookieName
} from "@/lib/super-admin-auth";

export async function revokeCurrentAuthSession() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(superAdminCookieName)?.value;
  const refreshToken = cookieStore.get(refreshTokenCookieName)?.value;
  const supabase = getSupabase();

  if (!supabase || !accessToken || !refreshToken) {
    return;
  }

  try {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    if (!error) {
      await supabase.auth.signOut({ scope: "local" });
    }
  } catch (error) {
    // Local cookie removal must still complete if Auth is briefly unreachable.
    console.error("WhatsOrder session revocation failed", {
      message: error instanceof Error ? error.message : "unknown error"
    });
  }
}

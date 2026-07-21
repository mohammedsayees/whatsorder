import "server-only";

import { getPublicAppUrl } from "@/lib/super-admin-data";
import { getSupabaseAdmin } from "@/lib/supabase";

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export type RestaurantInviteRole = "restaurant_admin" | "manager" | "staff";

async function findAuthUserByEmail(supabase: AdminClient, email: string) {
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function inviteRestaurantUser(
  supabase: AdminClient,
  restaurantId: string,
  email: string,
  role: RestaurantInviteRole
) {
  const { data: existingMemberships, error: existingMembershipError } = await supabase
    .from("restaurant_users")
    .select("restaurant_id")
    .eq("email", email);

  if (existingMembershipError) {
    return { ok: false as const, error: existingMembershipError.message };
  }

  if (
    (existingMemberships ?? []).some(
      (membership) => String(membership.restaurant_id) !== restaurantId
    )
  ) {
    return {
      ok: false as const,
      error: "This email is already assigned to another restaurant."
    };
  }

  const redirectTo = `${getPublicAppUrl()}/auth/invite`;
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { restaurant_id: restaurantId, role }
  });

  let user = data.user;
  let invitationSent = !error;

  if (error) {
    user = await findAuthUserByEmail(supabase, email);

    if (!user) {
      return { ok: false as const, error: error.message };
    }

    const { error: metadataError } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: { restaurant_id: restaurantId, role }
    });

    if (metadataError) {
      return { ok: false as const, error: metadataError.message };
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo
    });
    if (resetError) {
      return { ok: false as const, error: resetError.message };
    }
    invitationSent = true;
  }

  if (!user) {
    return { ok: false as const, error: "Supabase did not return the invited user." };
  }

  const now = new Date().toISOString();
  const { error: membershipError } = await supabase.from("restaurant_users").upsert(
    {
      restaurant_id: restaurantId,
      user_id: user.id,
      email,
      role,
      invited_at: now
    },
    { onConflict: "restaurant_id,email" }
  );

  if (membershipError) {
    return { ok: false as const, error: membershipError.message };
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfile?.role !== "super_admin") {
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: user.id,
      email,
      role: role === "staff" ? "staff" : "restaurant_admin",
      updated_at: now
    });
    if (profileError) {
      return { ok: false as const, error: profileError.message };
    }
  }

  return {
    ok: true as const,
    invitationSent,
    message: invitationSent
      ? `Account activation email sent to ${email}.`
      : `${email} already has an account and has been linked to this restaurant.`
  };
}

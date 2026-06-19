"use client";

import { Trash2 } from "lucide-react";
import { revokeRestaurantUserAccessAction } from "@/app/super-admin/actions";

export function RevokeTeamAccessButton({
  email,
  membershipId,
  restaurantId
}: {
  email: string;
  membershipId: string;
  restaurantId: string;
}) {
  return (
    <form
      action={revokeRestaurantUserAccessAction}
      onSubmit={(event) => {
        if (!window.confirm(`Revoke WhatsOrder access for ${email}?`)) {
          event.preventDefault();
        }
      }}
    >
      <input name="restaurant_id" type="hidden" value={restaurantId} />
      <input name="membership_id" type="hidden" value={membershipId} />
      <button
        className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-50"
        type="submit"
      >
        <Trash2 size={14} />
        Revoke
      </button>
    </form>
  );
}

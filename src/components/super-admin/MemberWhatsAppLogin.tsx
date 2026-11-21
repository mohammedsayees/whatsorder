import { MessageCircle } from "lucide-react";
import {
  addMemberByPhoneAction,
  saveMemberPhoneAction,
  sendOwnerWhatsAppLoginLinkAction
} from "@/app/super-admin/actions";
import { canReceiveOwnerLoginLink } from "@/lib/owner-whatsapp-login/config";
import { maskPhone } from "@/lib/owner-whatsapp-login/phone";

type Member = {
  id: string;
  email: string | null;
  role: string;
  phone_e164: string | null;
  phone_verified_at: string | null;
};

/** How a member is named in lists when they may have no email. */
export function memberLabel(member: Pick<Member, "email" | "phone_e164">): string {
  return member.email ?? (member.phone_e164 ? maskPhone(member.phone_e164) : "Unnamed member");
}

// Per-member WhatsApp number + "Send login link" (owner WhatsApp login, step 1).
export function MemberWhatsAppLogin({
  member,
  restaurantId,
  linkEnabled
}: {
  member: Member;
  restaurantId: string;
  linkEnabled: boolean;
}) {
  const verified = Boolean(member.phone_e164 && member.phone_verified_at);
  const canSend = linkEnabled && verified && canReceiveOwnerLoginLink(member.role);

  return (
    <div className="mt-3 rounded-lg bg-stone-50 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <MessageCircle className="text-leaf" size={14} />
        {member.phone_e164 ? (
          <>
            <span className="font-black">{maskPhone(member.phone_e164)}</span>
            <span
              className={`rounded-full px-2 py-0.5 font-black ${
                verified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
              }`}
            >
              {verified ? "Verified" : "Not verified"}
            </span>
          </>
        ) : (
          <span className="font-semibold text-stone-500">No WhatsApp number</span>
        )}
        {canSend ? (
          <form action={sendOwnerWhatsAppLoginLinkAction} className="ml-auto">
            <input name="restaurant_id" type="hidden" value={restaurantId} />
            <input name="membership_id" type="hidden" value={member.id} />
            <button
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-black text-ink"
              type="submit"
            >
              <MessageCircle size={14} />
              Send login link on WhatsApp
            </button>
          </form>
        ) : null}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-black text-stone-600">
          {member.phone_e164 ? "Change or verify number" : "Add WhatsApp number"}
        </summary>
        <form action={saveMemberPhoneAction} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input name="restaurant_id" type="hidden" value={restaurantId} />
          <input name="membership_id" type="hidden" value={member.id} />
          <input
            className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm"
            defaultValue={member.phone_e164 ?? ""}
            inputMode="tel"
            name="phone"
            placeholder="050 123 4567"
          />
          <button className="focus-ring rounded-lg bg-ink px-3 py-2 text-xs font-black text-white" type="submit">
            Save number
          </button>
          <label className="flex items-start gap-2 text-xs text-stone-600 sm:col-span-2">
            <input className="mt-0.5" name="confirmed" type="checkbox" />
            I confirmed this number belongs to this person (for example on a call). Only confirmed
            numbers can receive login links.
          </label>
          {member.email ? (
            <p className="text-xs text-stone-400 sm:col-span-2">Leave empty and save to remove the number.</p>
          ) : null}
        </form>
      </details>
    </div>
  );
}

// "Add by WhatsApp number" for people with no email.
export function AddMemberByPhoneForm({
  restaurantId,
  hasOwner
}: {
  restaurantId: string;
  hasOwner: boolean;
}) {
  return (
    <form
      action={addMemberByPhoneAction}
      className="mt-4 grid gap-3 rounded-lg border border-dashed border-stone-200 p-3 sm:grid-cols-[1fr_180px_auto]"
    >
      <input name="restaurant_id" type="hidden" value={restaurantId} />
      <p className="text-xs font-black text-stone-600 sm:col-span-3">No email? Add by WhatsApp number</p>
      <input
        className="focus-ring rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
        inputMode="tel"
        name="phone"
        placeholder="050 123 4567"
        required
      />
      <select
        className="focus-ring rounded-lg border border-stone-200 px-3 py-2.5 text-sm font-bold"
        defaultValue={hasOwner ? "manager" : "restaurant_admin"}
        name="role"
      >
        {hasOwner ? null : <option value="restaurant_admin">Owner</option>}
        <option value="manager">Manager</option>
        <option value="staff">Staff</option>
      </select>
      <button className="focus-ring rounded-lg bg-ink px-4 py-2.5 text-sm font-black text-white" type="submit">
        Add
      </button>
      <label className="flex items-start gap-2 text-xs text-stone-600 sm:col-span-3">
        <input className="mt-0.5" name="confirmed" required type="checkbox" />
        I confirmed this number belongs to this person (for example on a call).
      </label>
    </form>
  );
}

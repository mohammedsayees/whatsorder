"use client";

import { useState } from "react";
import { Download, Trash2 } from "lucide-react";

import { deleteRestaurantPermanentlyAction } from "@/app/super-admin/actions";

export function DeleteRestaurantPanel({
  restaurantId,
  name,
  slug,
  cancelled,
  preview
}: {
  restaurantId: string;
  name: string;
  slug: string;
  cancelled: boolean;
  preview: { orders: number; customers: number; menuItems: number; teamMembers: number } | null;
}) {
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const matches = typed.trim() === slug;

  return (
    <section className="rounded-lg border border-rose-300 bg-rose-50/60 p-5 sm:p-7">
      <h2 className="flex items-center gap-2 text-lg font-black text-rose-900">
        <Trash2 size={19} /> Danger zone: delete permanently
      </h2>

      {!cancelled ? (
        <p className="mt-2 text-sm text-rose-900/80">
          To delete <strong>{name}</strong> permanently, first set its status to{" "}
          <strong>Cancelled</strong> above and save. Cancelling already takes the store offline and
          locks the dashboard, and it can be undone. Deleting can&apos;t.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-rose-900/80">
            This erases <strong>{name}</strong> for good: its menu, orders, customers and their
            contact details, shifts, finance records, chats, uploaded files, and team sign-ins that
            belong to no other restaurant. It can&apos;t be undone. WhatsOrder&apos;s own billing
            records for the café are kept in the deletion log.
          </p>

          {preview ? (
            <ul className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-rose-900">
              <li className="rounded-full bg-white px-3 py-1 ring-1 ring-rose-200">{preview.orders} orders</li>
              <li className="rounded-full bg-white px-3 py-1 ring-1 ring-rose-200">{preview.customers} customers</li>
              <li className="rounded-full bg-white px-3 py-1 ring-1 ring-rose-200">{preview.menuItems} menu items</li>
              <li className="rounded-full bg-white px-3 py-1 ring-1 ring-rose-200">{preview.teamMembers} team members</li>
            </ul>
          ) : null}

          <a
            className="focus-ring mt-4 inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-black text-rose-900"
            href={`/super-admin/restaurants/${restaurantId}/export`}
          >
            <Download size={16} /> Download all data first (JSON)
          </a>

          <form
            action={deleteRestaurantPermanentlyAction}
            className="mt-5"
            onSubmit={(event) => {
              if (!matches || !window.confirm(`Permanently delete ${name}? This cannot be undone.`)) {
                event.preventDefault();
                return;
              }
              setSubmitting(true);
            }}
          >
            <input type="hidden" name="restaurant_id" value={restaurantId} />
            <label className="block text-sm font-bold text-rose-950" htmlFor="confirm-slug">
              Type the store link <code className="rounded bg-white px-1.5 py-0.5 ring-1 ring-rose-200">{slug}</code> to
              confirm
            </label>
            <input
              id="confirm-slug"
              name="confirm_slug"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="mt-1.5 w-full max-w-sm rounded-lg border border-rose-300 bg-white px-3 py-2 outline-none focus:border-rose-500"
            />
            <div>
              <button
                type="submit"
                disabled={!matches || submitting}
                className="focus-ring mt-3 inline-flex items-center gap-2 rounded-lg bg-rose-700 px-5 py-2.5 font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={16} /> {submitting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}

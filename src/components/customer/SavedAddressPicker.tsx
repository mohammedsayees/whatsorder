"use client";

import { Check, Home, Plus } from "lucide-react";
import type { CustomerLanguage } from "@/lib/customer-i18n";
import {
  ADDRESS_LABEL_MAX_LENGTH,
  savedAddressSummary,
  type SavedAddress
} from "@/lib/customer-addresses";

/**
 * Checkout chips for a signed-in customer's saved addresses at this café.
 * Selection is derived from the form fields (`selectedId`), so editing a
 * field after picking simply un-highlights the chip.
 */
export function SavedAddressPicker({
  addresses,
  language,
  onNew,
  onSelect,
  selectedId
}: {
  addresses: SavedAddress[];
  language: CustomerLanguage;
  onNew: () => void;
  onSelect: (address: SavedAddress) => void;
  selectedId: string | null;
}) {
  const isAr = language === "ar";
  if (addresses.length === 0) {
    return null;
  }

  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-bold">
        {isAr ? "عناوينك المحفوظة" : "Your saved addresses"}
      </legend>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {addresses.map((address) => {
          const selected = selectedId === address.id;
          return (
            <button
              aria-pressed={selected}
              className={`focus-ring flex min-w-40 max-w-56 shrink-0 flex-col items-start rounded-2xl border px-3 py-2 text-start transition ${
                selected ? "border-leaf bg-mint/40" : "border-stone-200 bg-white"
              }`}
              key={address.id}
              onClick={() => onSelect(address)}
              type="button"
            >
              <span className="inline-flex items-center gap-1.5 text-sm font-black text-ink">
                {selected ? <Check className="text-leaf" size={14} /> : <Home size={14} />}
                {address.label}
              </span>
              <span className="mt-0.5 line-clamp-2 text-xs font-semibold text-stone-500">
                {savedAddressSummary(address)}
              </span>
            </button>
          );
        })}
        <button
          aria-pressed={selectedId === null}
          className={`focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-dashed px-3 py-2 text-sm font-black ${
            selectedId === null ? "border-leaf text-leaf" : "border-stone-300 text-stone-600"
          }`}
          onClick={onNew}
          type="button"
        >
          <Plus size={14} />
          {isAr ? "عنوان جديد" : "New address"}
        </button>
      </div>
    </fieldset>
  );
}

/** "Save this address to my account" control shown under a new address. */
export function SaveAddressToggle({
  checked,
  label,
  language,
  onCheckedChange,
  onLabelChange
}: {
  checked: boolean;
  label: string;
  language: CustomerLanguage;
  onCheckedChange: (checked: boolean) => void;
  onLabelChange: (label: string) => void;
}) {
  const isAr = language === "ar";
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3">
      <label className="flex items-center gap-2 text-sm font-bold">
        <input
          checked={checked}
          className="h-4 w-4 accent-leaf"
          onChange={(event) => onCheckedChange(event.target.checked)}
          type="checkbox"
        />
        {isAr ? "احفظ هذا العنوان في حسابي" : "Save this address to my account"}
      </label>
      {checked ? (
        <input
          aria-label={isAr ? "اسم العنوان" : "Address name"}
          className="focus-ring mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
          maxLength={ADDRESS_LABEL_MAX_LENGTH}
          onChange={(event) => onLabelChange(event.target.value)}
          placeholder={isAr ? "مثال: المنزل، العمل" : "e.g. Home, Work"}
          value={label}
        />
      ) : null}
    </div>
  );
}

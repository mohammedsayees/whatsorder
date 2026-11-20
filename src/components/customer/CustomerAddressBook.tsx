"use client";

import { useState, useTransition } from "react";
import { Loader2, LocateFixed, MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import {
  deleteCustomerAddressAction,
  saveCustomerAddressAction,
  setDefaultCustomerAddressAction,
  type AddressActionResult
} from "@/app/r/[restaurantSlug]/account/actions";
import { ADDRESS_LIMITS } from "@/lib/customer-address";
import {
  ADDRESS_LABEL_MAX_LENGTH,
  MAX_SAVED_ADDRESSES,
  savedAddressSummary,
  type SavedAddress,
  type SavedAddressInput
} from "@/lib/customer-addresses";

type Translate = (en: string, ar: string) => string;

const EMPTY: SavedAddressInput = {
  label: "",
  area: "",
  building: "",
  flat: "",
  details: "",
  landmark: "",
  latitude: null,
  longitude: null
};

export function CustomerAddressBook({
  initialAddresses,
  lastUsedAddress = null,
  restaurantSlug,
  t
}: {
  initialAddresses: SavedAddress[];
  /** The profile's last delivery address, offered as the first saved one. */
  lastUsedAddress?: Omit<SavedAddressInput, "label"> | null;
  restaurantSlug: string;
  t: Translate;
}) {
  const [addresses, setAddresses] = useState(initialAddresses);
  // null = list view, "new" = adding, otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function errorText(result: Extract<AddressActionResult, { ok: false }>) {
    switch (result.error) {
      case "signed_out":
        return t("You've been signed out. Please sign in again.", "تم تسجيل خروجك. يرجى تسجيل الدخول مجدداً.");
      case "limit_reached":
        return t(
          `You can save up to ${MAX_SAVED_ADDRESSES} addresses.`,
          `يمكنك حفظ ${MAX_SAVED_ADDRESSES} عناوين كحد أقصى.`
        );
      case "invalid":
        return t(
          "Add a name and at least an area, building or details.",
          "أضف اسماً ومنطقة أو مبنى أو تفاصيل على الأقل."
        );
      case "customer_not_found":
        return t(
          "Place your first order to start saving addresses.",
          "اطلب طلبك الأول لتبدأ بحفظ العناوين."
        );
      default:
        return t("Something went wrong. Please try again.", "حدث خطأ. يرجى المحاولة مرة أخرى.");
    }
  }

  function run(action: () => Promise<AddressActionResult>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(errorText(result));
        return;
      }
      setAddresses(result.addresses);
      onDone?.();
    });
  }

  const editingAddress =
    editing && editing !== "new" ? addresses.find((address) => address.id === editing) ?? null : null;

  if (editing) {
    return (
      <AddressForm
        error={error}
        initial={
          editingAddress ??
          (addresses.length === 0
            ? { ...EMPTY, ...lastUsedAddress, label: t("Home", "المنزل") }
            : EMPTY)
        }
        isDefault={editingAddress?.is_default ?? addresses.length === 0}
        onCancel={() => {
          setError(null);
          setEditing(null);
        }}
        onSave={(input, makeDefault) =>
          run(
            () => saveCustomerAddressAction(restaurantSlug, editingAddress?.id ?? null, input, makeDefault),
            () => setEditing(null)
          )
        }
        pending={pending}
        t={t}
      />
    );
  }

  return (
    <div className="space-y-3">
      {addresses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm font-semibold text-stone-500">
          {t(
            "Save your home or work address to check out faster.",
            "احفظ عنوان منزلك أو عملك لإتمام الطلب بشكل أسرع."
          )}
        </p>
      ) : (
        <ul className="space-y-3">
          {addresses.map((address) => (
            <li className="rounded-2xl border border-stone-200 bg-white p-4" key={address.id}>
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 shrink-0 text-leaf" size={18} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-black text-ink">
                    {address.label}
                    {address.is_default ? (
                      <span className="rounded-full bg-mint px-2 py-0.5 text-xs font-black text-leaf">
                        {t("Default", "الافتراضي")}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-stone-600">{savedAddressSummary(address)}</p>
                  {address.landmark ? (
                    <p className="text-xs font-semibold text-stone-500">{address.landmark}</p>
                  ) : null}
                  {address.latitude !== null ? (
                    <a
                      className="text-xs font-black text-leaf underline-offset-4 hover:underline"
                      href={`https://www.google.com/maps?q=${address.latitude},${address.longitude}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {t("Location pin saved", "تم حفظ الموقع")}
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-3 py-1.5 text-xs font-black text-ink disabled:opacity-60"
                  disabled={pending}
                  onClick={() => setEditing(address.id)}
                  type="button"
                >
                  <Pencil size={13} />
                  {t("Edit", "تعديل")}
                </button>
                {!address.is_default ? (
                  <button
                    className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-3 py-1.5 text-xs font-black text-ink disabled:opacity-60"
                    disabled={pending}
                    onClick={() => run(() => setDefaultCustomerAddressAction(restaurantSlug, address.id))}
                    type="button"
                  >
                    <Star size={13} />
                    {t("Make default", "تعيين كافتراضي")}
                  </button>
                ) : null}
                <button
                  className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-rose-200 px-3 py-1.5 text-xs font-black text-rose-700 disabled:opacity-60"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(t(`Delete "${address.label}"?`, `حذف "${address.label}"؟`))) {
                      run(() => deleteCustomerAddressAction(restaurantSlug, address.id));
                    }
                  }}
                  type="button"
                >
                  <Trash2 size={13} />
                  {t("Delete", "حذف")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p className="text-sm font-bold text-rose-700" role="alert">
          {error}
        </p>
      ) : null}

      {addresses.length < MAX_SAVED_ADDRESSES ? (
        <button
          className="focus-ring inline-flex items-center gap-2 rounded-full bg-leaf px-4 py-2.5 text-sm font-black text-white disabled:opacity-60"
          disabled={pending}
          onClick={() => {
            setError(null);
            setEditing("new");
          }}
          type="button"
        >
          <Plus size={15} />
          {addresses.length === 0 && lastUsedAddress
            ? t("Save my last delivery address", "احفظ آخر عنوان توصيل")
            : t("Add address", "إضافة عنوان")}
        </button>
      ) : null}
    </div>
  );
}

function AddressForm({
  error,
  initial,
  isDefault,
  onCancel,
  onSave,
  pending,
  t
}: {
  error: string | null;
  initial: SavedAddressInput;
  isDefault: boolean;
  onCancel: () => void;
  onSave: (input: SavedAddressInput, makeDefault: boolean) => void;
  pending: boolean;
  t: Translate;
}) {
  const [value, setValue] = useState<SavedAddressInput>(initial);
  const [makeDefault, setMakeDefault] = useState(isDefault);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const field = (name: keyof SavedAddressInput) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValue((current) => ({ ...current, [name]: event.target.value }));

  function capturePin() {
    setLocationError(null);
    if (!("geolocation" in navigator)) {
      setLocationError(t("Location isn't available on this device.", "الموقع غير متاح على هذا الجهاز."));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setValue((current) => ({
          ...current,
          latitude: Number(position.coords.latitude.toFixed(7)),
          longitude: Number(position.coords.longitude.toFixed(7))
        }));
      },
      () => {
        setLocating(false);
        setLocationError(
          t("Couldn't get your location. You can still save the address.", "تعذر تحديد موقعك. لا يزال بإمكانك حفظ العنوان.")
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  const input = "focus-ring mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm";
  const labelClass = "block text-xs font-black uppercase tracking-wide text-stone-500";

  return (
    <form
      className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(value, makeDefault);
      }}
    >
      <label className={labelClass}>
        {t("Name", "الاسم")}
        <input
          className={input}
          maxLength={ADDRESS_LABEL_MAX_LENGTH}
          onChange={field("label")}
          placeholder={t("e.g. Home, Work", "مثال: المنزل، العمل")}
          required
          value={value.label}
        />
      </label>
      <label className={labelClass}>
        {t("Area", "المنطقة")}
        <input autoComplete="address-level2" className={input} maxLength={ADDRESS_LIMITS.area} onChange={field("area")} value={value.area} />
      </label>
      <div className="grid grid-cols-[1fr_7.5rem] gap-3">
        <label className={labelClass}>
          {t("Building or villa", "المبنى أو الفيلا")}
          <input autoComplete="address-line1" className={input} maxLength={ADDRESS_LIMITS.building} onChange={field("building")} value={value.building} />
        </label>
        <label className={labelClass}>
          {t("Flat / floor", "الشقة / الطابق")}
          <input autoComplete="address-line2" className={input} maxLength={ADDRESS_LIMITS.flat} onChange={field("flat")} value={value.flat} />
        </label>
      </div>
      <label className={labelClass}>
        {t("More details", "تفاصيل إضافية")}
        <input className={input} maxLength={ADDRESS_LIMITS.details} onChange={field("details")} value={value.details} />
      </label>
      <label className={labelClass}>
        {t("Landmark (optional)", "معلم قريب (اختياري)")}
        <input className={input} maxLength={ADDRESS_LIMITS.landmark} onChange={field("landmark")} value={value.landmark} />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="focus-ring inline-flex items-center gap-2 rounded-full border border-leaf px-3 py-2 text-xs font-black text-leaf disabled:opacity-60"
          disabled={locating}
          onClick={capturePin}
          type="button"
        >
          {locating ? <Loader2 className="animate-spin" size={14} /> : <LocateFixed size={14} />}
          {value.latitude !== null ? t("Update location pin", "تحديث الموقع") : t("Add my current location", "إضافة موقعي الحالي")}
        </button>
        {value.latitude !== null ? (
          <button
            className="focus-ring text-xs font-black text-stone-500 underline-offset-4 hover:underline"
            onClick={() => setValue((current) => ({ ...current, latitude: null, longitude: null }))}
            type="button"
          >
            {t("Remove pin", "إزالة الموقع")}
          </button>
        ) : null}
      </div>
      {locationError ? <p className="text-xs font-bold text-amber-800">{locationError}</p> : null}

      <label className="flex items-center gap-2 text-sm font-bold text-ink">
        <input
          checked={makeDefault}
          className="h-4 w-4 accent-leaf"
          disabled={isDefault}
          onChange={(event) => setMakeDefault(event.target.checked)}
          type="checkbox"
        />
        {t("Use as my default address", "استخدامه كعنوان افتراضي")}
      </label>

      {error ? (
        <p className="text-sm font-bold text-rose-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          className="focus-ring inline-flex items-center gap-2 rounded-full bg-leaf px-5 py-2.5 text-sm font-black text-white disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? <Loader2 className="animate-spin" size={15} /> : null}
          {t("Save address", "حفظ العنوان")}
        </button>
        <button
          className="focus-ring rounded-full border border-stone-200 px-5 py-2.5 text-sm font-black text-ink"
          onClick={onCancel}
          type="button"
        >
          {t("Cancel", "إلغاء")}
        </button>
      </div>
    </form>
  );
}

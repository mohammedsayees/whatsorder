"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Minus, Plus, X } from "lucide-react";
import { configuredUnitPrice } from "@/lib/cart-line";
import { formatCurrency } from "@/lib/currency";
import {
  customerTranslations,
  type CustomerLanguage
} from "@/lib/customer-i18n";
import type { ResolvedOptionGroup } from "@/lib/menu-option-groups";
import type {
  CartLineOption,
  CustomerMenuItem,
  CustomerMenuOffer,
  CustomerMenuOption,
  CustomerMenuOptionGroup,
  PublicRestaurant
} from "@/lib/types";

export { resolveOptionGroupsByItem } from "@/lib/menu-option-groups";
export type { ResolvedOptionGroup } from "@/lib/menu-option-groups";

// Bottom-sheet option picker for items with attached option groups. Purely
// presentational: the parent decides what "add" means (customer cart vs staff
// ticket). Selection state lives here and resets each open because the parent
// mounts the sheet conditionally. Nothing is pre-selected on purpose: the
// customer makes each required choice (size, sugar…) themselves.

// Sheet-only copy: this module loads lazily, so it stays out of the menu bundle.
const COPY = {
  en: {
    close: "Close",
    decrease: "Fewer",
    increase: "More",
    chooseFirst: (group: string) => `Choose ${group} first`,
    done: "Done"
  },
  ar: {
    close: "إغلاق",
    decrease: "أقل",
    increase: "أكثر",
    chooseFirst: (group: string) => `اختر ${group} أولاً`,
    done: "تم"
  }
} as const;

function isVariantGroup(group: CustomerMenuOptionGroup) {
  return group.min_select === 1 && group.max_select === 1;
}

function optionName(option: CustomerMenuOption, language: CustomerLanguage) {
  return language === "ar" && option.name_ar ? option.name_ar : option.name;
}

function groupName(group: CustomerMenuOptionGroup, language: CustomerLanguage) {
  return language === "ar" && group.name_ar ? group.name_ar : group.name;
}

function deltaLabel(delta: number, restaurant: PublicRestaurant) {
  if (delta === 0) {
    return null;
  }
  return `${delta > 0 ? "+" : "−"}${formatCurrency(Math.abs(delta), restaurant)}`;
}

function toCartOption(option: CustomerMenuOption): CartLineOption {
  return {
    option_id: option.id,
    group_id: option.group_id,
    name: option.name,
    name_ar: option.name_ar ?? null,
    price_delta: option.price_delta
  };
}

export function ItemOptionsSheet({
  addDisabledReason = null,
  basePrice,
  groups,
  initialOptions,
  initialQuantity = 1,
  item,
  language,
  maxQuantity,
  offer,
  onAdd,
  onClose,
  restaurant,
  showDetails = false,
  submitLabel
}: {
  /** When set, the item can be viewed but not added; shown on the button. */
  addDisabledReason?: string | null;
  /** Item base price, or the offer's promotional price when seeded by an offer. */
  basePrice: number;
  groups: ResolvedOptionGroup[];
  /** Editing a cart line: start from its choices (never a default pick). */
  initialOptions?: CartLineOption[];
  initialQuantity?: number;
  item: CustomerMenuItem;
  language: CustomerLanguage;
  /** Remaining allowed quantity (offer cap minus in-cart total); undefined = unlimited. */
  maxQuantity?: number;
  offer?: CustomerMenuOffer | null;
  onAdd: (options: CartLineOption[], quantity: number) => void;
  onClose: () => void;
  restaurant: PublicRestaurant;
  /** Customer menu: show the item's photo and full description at the top. */
  showDetails?: boolean;
  /** Button text instead of "Add to cart" (e.g. "Update item"). */
  submitLabel?: string;
}) {
  const t = customerTranslations[language];
  const copy = COPY[language === "ar" ? "ar" : "en"];
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const groupRefs = useRef<Record<string, HTMLElement | null>>({});
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const start: Record<string, string[]> = {};
    for (const option of initialOptions ?? []) {
      start[option.group_id] = [...(start[option.group_id] ?? []), option.option_id];
    }
    return start;
  });
  const [quantity, setQuantity] = useState(Math.max(1, initialQuantity));
  // Set after an Add tap with a required choice still open: highlights it.
  const [missingGroupId, setMissingGroupId] = useState<string | null>(null);
  // Parents pass an inline onClose; keep the latest without re-running the
  // dialog setup (which would steal focus on every selection).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Behave like a dialog: Escape closes, focus stays inside, the menu behind
  // does not scroll, and focus returns to where it was on close.
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  // Only groups with at least one available option participate; a required
  // group with nothing available must not brick the item (same rule as the
  // server's effective-min check in verifyCartAgainstMenu).
  const activeGroups = useMemo(
    () =>
      groups
        .map(({ group, options }) => ({
          group,
          options: options.filter((option) => option.is_available)
        }))
        .filter(({ options }) => options.length > 0),
    [groups]
  );

  const toggleOption = (group: CustomerMenuOptionGroup, optionId: string) => {
    setSelected((current) => {
      const chosen = current[group.id] ?? [];

      if (isVariantGroup(group)) {
        return { ...current, [group.id]: [optionId] };
      }

      if (chosen.includes(optionId)) {
        return { ...current, [group.id]: chosen.filter((id) => id !== optionId) };
      }

      const max = group.max_select ?? Infinity;

      if (chosen.length >= max) {
        return current;
      }

      return { ...current, [group.id]: [...chosen, optionId] };
    });
  };

  const selectedOptions = useMemo(() => {
    const list: CartLineOption[] = [];

    for (const { group, options } of activeGroups) {
      const chosen = selected[group.id] ?? [];
      for (const option of options) {
        if (chosen.includes(option.id)) {
          list.push(toCartOption(option));
        }
      }
    }

    return list;
  }, [activeGroups, selected]);

  const groupSatisfied = (group: CustomerMenuOptionGroup, available: number) =>
    (selected[group.id] ?? []).length >= Math.min(group.min_select, available);
  const firstMissing = activeGroups.find(({ group, options }) => !groupSatisfied(group, options.length)) ?? null;
  const missingGroup =
    missingGroupId && firstMissing && firstMissing.group.id === missingGroupId ? firstMissing.group : null;

  const unitPrice = configuredUnitPrice(basePrice, selectedOptions);
  const quantityCap = maxQuantity ?? Infinity;
  const canAdd = !addDisabledReason && quantity >= 1 && quantity <= quantityCap;
  const itemName = language === "ar" && item.name_ar ? item.name_ar : item.name;
  const itemDescription = (
    language === "ar" && item.description_ar ? item.description_ar : item.description
  )?.trim();

  function add() {
    if (firstMissing) {
      // Point at the open choice instead of a silently disabled button.
      setMissingGroupId(firstMissing.group.id);
      groupRefs.current[firstMissing.group.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    onAdd(selectedOptions, quantity);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
      onClick={(event) => {
        // Tapping the dimmed backdrop closes; taps inside the sheet do not.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:max-w-md sm:rounded-[28px]"
        ref={dialogRef}
        role="dialog"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          {showDetails && item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="-mx-5 -mt-5 mb-4 aspect-[16/10] w-[calc(100%+2.5rem)] max-w-none object-cover"
              // A dead photo link drops the header instead of leaving an empty box.
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
              src={item.image_url}
            />
          ) : null}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-black" id={titleId}>
                {itemName}
              </h2>
              {offer ? (
                <p className="mt-1 text-xs font-black text-rose-600">
                  {t.offer} · {formatCurrency(basePrice, restaurant)}
                </p>
              ) : null}
              {showDetails && itemDescription ? (
                <p className="mt-2 text-sm leading-6 text-stone-600">{itemDescription}</p>
              ) : null}
            </div>
            <button
              aria-label={copy.close}
              className="focus-ring shrink-0 rounded-full bg-stone-100 p-2 text-stone-500"
              onClick={onClose}
              ref={closeRef}
              type="button"
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-5">
            {activeGroups.map(({ group, options }) => {
              const variant = isVariantGroup(group);
              const chosen = selected[group.id] ?? [];
              const max = group.max_select ?? Infinity;
              const required = group.min_select > 0;
              const satisfied = groupSatisfied(group, options.length);
              const flagged = missingGroup?.id === group.id;

              return (
                <section
                  className={`rounded-2xl transition ${flagged ? "-m-2 p-2 ring-2 ring-rose-400" : ""}`}
                  key={group.id}
                  ref={(node) => {
                    groupRefs.current[group.id] = node;
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-black">{groupName(group, language)}</h3>
                    {required && satisfied ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-black text-leaf">
                        <Check aria-hidden size={12} />
                        {copy.done}
                      </span>
                    ) : (
                      <span
                        className={`text-[11px] font-black ${required ? "text-rose-600" : "text-stone-400"}`}
                      >
                        {variant
                          ? `${t.optionsRequired} · ${t.chooseOne}`
                          : required
                            ? t.optionsRequired
                            : group.max_select
                              ? `${t.optionsOptional} · ${t.chooseUpTo} ${group.max_select}`
                              : t.optionsOptional}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-2">
                    {options.map((option) => {
                      const isChosen = chosen.includes(option.id);
                      const delta = deltaLabel(option.price_delta, restaurant);
                      const disableUnchosen = !variant && !isChosen && chosen.length >= max;

                      return (
                        <label
                          className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                            isChosen ? "border-leaf bg-mint/15 text-ink" : "border-stone-200 text-stone-700"
                          } ${disableUnchosen ? "opacity-40" : ""}`}
                          key={option.id}
                        >
                          <span className="flex items-center gap-2">
                            <input
                              checked={isChosen}
                              className="accent-leaf"
                              disabled={disableUnchosen}
                              name={variant ? `group-${group.id}` : undefined}
                              onChange={() => {
                                toggleOption(group, option.id);
                                if (flagged) setMissingGroupId(null);
                              }}
                              type={variant ? "radio" : "checkbox"}
                            />
                            {optionName(option, language)}
                          </span>
                          {delta ? <span className="text-xs font-black text-leaf">{delta}</span> : null}
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        {/* Pinned: the price and Add button never scroll out of reach. */}
        <div className="border-t border-stone-100 bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          {missingGroup ? (
            <p className="mb-2 text-center text-sm font-black text-rose-600" role="status">
              {copy.chooseFirst(groupName(missingGroup, language))}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-full border border-stone-200 px-1 py-1">
              <button
                aria-label={copy.decrease}
                className="focus-ring grid h-10 w-10 place-items-center rounded-full text-stone-600 disabled:opacity-30"
                disabled={quantity <= 1}
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                type="button"
              >
                <Minus size={16} />
              </button>
              <span aria-live="polite" className="min-w-6 text-center font-black">
                {quantity}
              </span>
              <button
                aria-label={copy.increase}
                className="focus-ring grid h-10 w-10 place-items-center rounded-full text-stone-600 disabled:opacity-30"
                disabled={quantity >= quantityCap}
                onClick={() => setQuantity((value) => Math.min(quantityCap, value + 1))}
                type="button"
              >
                <Plus size={16} />
              </button>
            </div>
            <button
              className={`focus-ring min-h-12 flex-1 rounded-full px-4 py-3 font-black text-white disabled:opacity-40 ${
                firstMissing && !addDisabledReason ? "bg-leaf/70" : "bg-leaf"
              }`}
              disabled={!canAdd}
              onClick={add}
              type="button"
            >
              {addDisabledReason ?? `${submitLabel ?? t.addToCart} · ${formatCurrency(unitPrice * quantity, restaurant)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

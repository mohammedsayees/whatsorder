"use client";

import { Bike, CarFront, ShoppingBag, Utensils } from "lucide-react";
import { customerTranslations, type CustomerLanguage } from "@/lib/customer-i18n";
import type { FulfilmentType } from "@/lib/types";

const ICONS = {
  delivery: Bike,
  takeaway: ShoppingBag,
  car_pickup: CarFront,
  dine_in: Utensils
} as const;

export function fulfilmentLabel(type: FulfilmentType, language: CustomerLanguage) {
  const t = customerTranslations[language];

  return type === "delivery"
    ? t.delivery
    : type === "takeaway"
      ? t.takeawayShort
      : type === "car_pickup"
        ? t.carPickupShort
        : t.dineIn;
}

/** Compact segmented control for how the customer receives the order. */
export function FulfilmentSelector({
  available,
  language,
  onChange,
  value
}: {
  available: FulfilmentType[];
  language: CustomerLanguage;
  onChange: (type: FulfilmentType) => void;
  value: FulfilmentType;
}) {
  const t = customerTranslations[language];

  if (available.length < 2) {
    return null;
  }

  // Four modes do not fit side by side on a phone: put icons above labels.
  const stacked = available.length >= 4;

  return (
    <div
      aria-label={t.howToReceive}
      className="grid gap-1 rounded-2xl bg-stone-100 p-1"
      role="radiogroup"
      style={{ gridTemplateColumns: `repeat(${available.length}, minmax(0, 1fr))` }}
    >
      {available.map((type) => {
        const Icon = ICONS[type];
        const selected = value === type;

        return (
          <button
            aria-checked={selected}
            className={`focus-ring flex min-h-11 min-w-0 items-center justify-center rounded-xl px-1.5 py-1.5 font-black transition ${
              stacked
                ? "flex-col gap-0.5 text-[11px] sm:flex-row sm:gap-1.5 sm:text-sm"
                : "gap-1.5 text-xs sm:text-sm"
            } ${selected ? "bg-white text-leaf shadow-sm" : "text-stone-600"}`}
            key={type}
            onClick={() => onChange(type)}
            role="radio"
            type="button"
          >
            <Icon aria-hidden size={16} />
            <span className="max-w-full truncate">{fulfilmentLabel(type, language)}</span>
          </button>
        );
      })}
    </div>
  );
}

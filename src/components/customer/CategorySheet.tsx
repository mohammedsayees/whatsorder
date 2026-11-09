"use client";

import { ChevronLeft, X } from "lucide-react";
import {
  customerTranslations,
  type CustomerLanguage
} from "@/lib/customer-i18n";
import type { CustomerMenuCategory } from "@/lib/types";

type CategorySheetEntry = {
  category: CustomerMenuCategory;
  availableItemCount: number;
};

export function CategorySheet({
  activeCategoryId,
  categories,
  language,
  onClose,
  onSelect
}: {
  activeCategoryId: string | null;
  categories: CategorySheetEntry[];
  language: CustomerLanguage;
  onClose: () => void;
  onSelect: (categoryId: string) => void;
}) {
  const t = customerTranslations[language];

  return (
    <div className="fixed inset-0 z-40 bg-black/40" role="dialog" aria-modal="true">
      <button
        aria-label={t.closeCategories}
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />

      <div className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-stone-200" />
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-ink">{t.browseCategories}</h2>
            <p className="text-sm text-stone-500">{t.jumpStraight}</p>
          </div>
          <button
            aria-label={t.closeCategories}
            className="focus-ring grid h-10 w-10 place-items-center rounded-full border border-stone-200 bg-white text-ink"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-2">
          {categories.map(({ category, availableItemCount }) => (
            <button
              key={category.id}
              className={`focus-ring grid grid-cols-[1fr_auto] items-center gap-4 rounded-2xl border px-4 py-3 text-start ${
                activeCategoryId === category.id
                  ? "border-leaf bg-mint/10"
                  : "border-stone-200 bg-white"
              }`}
              onClick={() => onSelect(category.id)}
              type="button"
            >
              <div>
                <p className="font-bold text-ink">
                  {language === "ar" && category.name_ar
                    ? category.name_ar
                    : category.name}
                </p>
                <p className="text-sm text-stone-500">{t.categoryDrawerHint}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="min-w-8 rounded-full bg-stone-100 px-2.5 py-1 text-center text-sm font-black text-ink">
                  {availableItemCount}
                </span>
                <ChevronLeft className="rotate-180 text-stone-400" size={18} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

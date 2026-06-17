"use client";

import {
  customerLanguageLabels,
  type CustomerLanguage
} from "@/lib/customer-i18n";

export function LanguageToggle({
  language,
  setLanguage
}: {
  language: CustomerLanguage;
  setLanguage: (language: CustomerLanguage) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-stone-200 bg-white p-1 text-xs font-black shadow-sm">
      {(["en", "ar"] as CustomerLanguage[]).map((option) => (
        <button
          className={`focus-ring rounded-full px-3 py-1.5 transition ${
            language === option ? "bg-ink text-white" : "text-stone-600"
          }`}
          key={option}
          onClick={() => setLanguage(option)}
          type="button"
        >
          {customerLanguageLabels[option]}
        </button>
      ))}
    </div>
  );
}

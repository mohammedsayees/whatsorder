"use client";

import {
  customerLanguageLabels,
  customerTranslations,
  type CustomerLanguage
} from "@/lib/customer-i18n";

export function LanguageToggle({
  compact = false,
  language,
  setLanguage
}: {
  /** One round button showing the other language, for tight spots like the menu banner. */
  compact?: boolean;
  language: CustomerLanguage;
  setLanguage: (language: CustomerLanguage) => void;
}) {
  if (compact) {
    const other: CustomerLanguage = language === "ar" ? "en" : "ar";
    return (
      <button
        aria-label={customerTranslations[language].switchLanguage}
        className="focus-ring grid h-9 w-9 place-items-center rounded-full bg-white/90 text-sm font-black text-ink shadow-sm"
        lang={other}
        onClick={() => setLanguage(other)}
        type="button"
      >
        {other === "ar" ? "ع" : "EN"}
      </button>
    );
  }

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

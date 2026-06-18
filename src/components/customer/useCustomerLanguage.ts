"use client";

import { useEffect, useState } from "react";
import {
  customerLanguageStorageKey,
  type CustomerLanguage
} from "@/lib/customer-i18n";

export function useCustomerLanguage() {
  const [language, setLanguageState] = useState<CustomerLanguage>("en");

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem(customerLanguageStorageKey);

    if (savedLanguage === "ar") {
      queueMicrotask(() => setLanguageState("ar"));
    }
  }, []);

  function setLanguage(nextLanguage: CustomerLanguage) {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(customerLanguageStorageKey, nextLanguage);
  }

  return { language, setLanguage };
}

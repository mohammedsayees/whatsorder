import { normalizeCustomerPhone } from "@/lib/whatsapp";

export const MAX_DAILY_SUMMARY_RECIPIENTS = 5;

type DailySummaryRecipientConfig = {
  daily_summary_phones?: unknown;
  daily_summary_phone?: string | null;
  owner_phone?: string | null;
  phone_country_code?: string | null;
};

function normalizedPhone(value: string, phoneCountryCode: string) {
  const normalized = normalizeCustomerPhone(value, phoneCountryCode);
  return /^\d{7,15}$/.test(normalized) ? normalized : null;
}

export function parseDailySummaryPhones(
  value: string,
  phoneCountryCode = "971"
): string[] {
  const seen = new Set<string>();

  for (const entry of value.split(/[\n,;]+/)) {
    const phone = normalizedPhone(entry.trim(), phoneCountryCode);
    if (phone) {
      seen.add(phone);
    }
    if (seen.size === MAX_DAILY_SUMMARY_RECIPIENTS) {
      break;
    }
  }

  return [...seen];
}

export function resolveDailySummaryPhones(
  restaurant: DailySummaryRecipientConfig
): string[] {
  const countryCode = restaurant.phone_country_code || "971";
  const configured = Array.isArray(restaurant.daily_summary_phones)
    ? restaurant.daily_summary_phones.filter(
        (entry): entry is string => typeof entry === "string"
      )
    : [];
  const preferred = parseDailySummaryPhones(configured.join("\n"), countryCode);

  if (preferred.length > 0) {
    return preferred;
  }

  return parseDailySummaryPhones(
    restaurant.daily_summary_phone || restaurant.owner_phone || "",
    countryCode
  );
}

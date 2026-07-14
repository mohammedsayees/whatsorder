import type { CountryCode, RestaurantLocalization } from "@/lib/types";

export const countryProfiles = {
  AE: {
    countryCode: "AE",
    countryName: "United Arab Emirates",
    currencyCode: "AED",
    locale: "en-AE",
    phoneCountryCode: "971",
    phoneExample: "971554822424",
    highAverageOrderThreshold: 60,
    vipSpendThreshold: 250,
    timeZone: "Asia/Dubai",
    utcOffset: "+04:00"
  },
  IN: {
    countryCode: "IN",
    countryName: "India",
    currencyCode: "INR",
    locale: "en-IN",
    phoneCountryCode: "91",
    phoneExample: "919876543210",
    highAverageOrderThreshold: 1000,
    vipSpendThreshold: 10000,
    timeZone: "Asia/Kolkata",
    utcOffset: "+05:30"
  }
} as const;

export type CountryProfile = (typeof countryProfiles)[CountryCode];

export function isCountryCode(value: unknown): value is CountryCode {
  return value === "AE" || value === "IN";
}

export function getCountryProfile(value?: CountryCode | null): CountryProfile {
  return countryProfiles[value ?? "AE"];
}

export function getRestaurantLocalization(
  restaurant?: Partial<RestaurantLocalization> | null
): RestaurantLocalization & { utcOffset: string } {
  const profile = getCountryProfile(
    isCountryCode(restaurant?.country_code) ? restaurant.country_code : "AE"
  );

  return {
    country_code: profile.countryCode,
    currency_code: profile.currencyCode,
    locale: profile.locale,
    phone_country_code: profile.phoneCountryCode,
    time_zone: profile.timeZone,
    utcOffset: profile.utcOffset
  };
}

export function countryProfileFields(countryCode: CountryCode) {
  const profile = getCountryProfile(countryCode);

  return {
    country_code: profile.countryCode,
    currency_code: profile.currencyCode,
    locale: profile.locale,
    phone_country_code: profile.phoneCountryCode,
    time_zone: profile.timeZone
  };
}

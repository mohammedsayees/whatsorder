import { getRestaurantLocalization } from "@/lib/localization";
import type { RestaurantLocalization } from "@/lib/types";

export const restaurantTimeZone = "Asia/Dubai";

type DateInput = string | number | Date;

function asDate(value: DateInput) {
  return value instanceof Date ? value : new Date(value);
}

function restaurantDateParts(
  value: DateInput,
  restaurant?: Partial<RestaurantLocalization> | null
) {
  const localization = getRestaurantLocalization(restaurant);
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: localization.time_zone,
    year: "numeric"
  }).formatToParts(asDate(value));
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    day: values.get("day") ?? "",
    month: values.get("month") ?? "",
    year: values.get("year") ?? ""
  };
}

export function formatUaeDateTime(value: DateInput) {
  return formatRestaurantDateTime(value);
}

export function formatRestaurantDateTime(
  value: DateInput,
  restaurant?: Partial<RestaurantLocalization> | null
) {
  const localization = getRestaurantLocalization(restaurant);
  return new Intl.DateTimeFormat(localization.locale, {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: localization.time_zone
  }).format(asDate(value));
}

export function formatUaeShortDateTime(value: DateInput) {
  return formatRestaurantShortDateTime(value);
}

export function formatRestaurantShortDateTime(
  value: DateInput,
  restaurant?: Partial<RestaurantLocalization> | null
) {
  const localization = getRestaurantLocalization(restaurant);
  return new Intl.DateTimeFormat(localization.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: localization.time_zone
  }).format(asDate(value));
}

export function formatUaeDate(value: DateInput) {
  return formatRestaurantDate(value);
}

export function formatRestaurantDate(
  value: DateInput,
  restaurant?: Partial<RestaurantLocalization> | null
) {
  const localization = getRestaurantLocalization(restaurant);
  return new Intl.DateTimeFormat(localization.locale, {
    dateStyle: "medium",
    timeZone: localization.time_zone
  }).format(asDate(value));
}

export function getRestaurantDateKey(
  value: DateInput,
  restaurant?: Partial<RestaurantLocalization> | null
) {
  const { day, month, year } = restaurantDateParts(value, restaurant);
  return `${year}-${month}-${day}`;
}

export function isSameUaeCalendarDay(first: DateInput, second: DateInput) {
  return isSameRestaurantCalendarDay(first, second);
}

export function isSameRestaurantCalendarDay(
  first: DateInput,
  second: DateInput,
  restaurant?: Partial<RestaurantLocalization> | null
) {
  const firstParts = restaurantDateParts(first, restaurant);
  const secondParts = restaurantDateParts(second, restaurant);

  return (
    firstParts.year === secondParts.year &&
    firstParts.month === secondParts.month &&
    firstParts.day === secondParts.day
  );
}

export function getUaeMonthStartIso(value: DateInput = new Date()) {
  return getRestaurantMonthStartIso(value);
}

export function getRestaurantMonthStartIso(
  value: DateInput = new Date(),
  restaurant?: Partial<RestaurantLocalization> | null
) {
  const localization = getRestaurantLocalization(restaurant);
  const { month, year } = restaurantDateParts(value, restaurant);
  return new Date(`${year}-${month}-01T00:00:00${localization.utcOffset}`).toISOString();
}

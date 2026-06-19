export const restaurantTimeZone = "Asia/Dubai";

type DateInput = string | number | Date;

function asDate(value: DateInput) {
  return value instanceof Date ? value : new Date(value);
}

function uaeDateParts(value: DateInput) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: restaurantTimeZone,
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
  return new Intl.DateTimeFormat("en-AE", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: restaurantTimeZone
  }).format(asDate(value));
}

export function formatUaeShortDateTime(value: DateInput) {
  return new Intl.DateTimeFormat("en-AE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: restaurantTimeZone
  }).format(asDate(value));
}

export function formatUaeDate(value: DateInput) {
  return new Intl.DateTimeFormat("en-AE", {
    dateStyle: "medium",
    timeZone: restaurantTimeZone
  }).format(asDate(value));
}

export function isSameUaeCalendarDay(first: DateInput, second: DateInput) {
  const firstParts = uaeDateParts(first);
  const secondParts = uaeDateParts(second);

  return (
    firstParts.year === secondParts.year &&
    firstParts.month === secondParts.month &&
    firstParts.day === secondParts.day
  );
}

export function getUaeMonthStartIso(value: DateInput = new Date()) {
  const { month, year } = uaeDateParts(value);
  return new Date(`${year}-${month}-01T00:00:00+04:00`).toISOString();
}

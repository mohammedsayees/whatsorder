import { restaurantTimeZone } from "@/lib/date-time";

export const weekDays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
] as const;

export type WeekDay = (typeof weekDays)[number];
export type OpeningHoursDay = {
  closed: boolean;
  open: string;
  close: string;
};
export type OpeningHours = Record<WeekDay, OpeningHoursDay>;

export const defaultOpeningHours: OpeningHours = Object.fromEntries(
  weekDays.map((day) => [
    day,
    {
      closed: false,
      open: "08:00",
      close: "23:00"
    }
  ])
) as OpeningHours;

export const weekDayLabels: Record<WeekDay, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday"
};

function validTime(value: unknown) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeOpeningHours(value: unknown): OpeningHours {
  const source =
    value && typeof value === "object"
      ? (value as Partial<Record<WeekDay, Partial<OpeningHoursDay>>>)
      : {};

  return Object.fromEntries(
    weekDays.map((day) => {
      const entry = source[day];
      return [
        day,
        {
          closed: entry?.closed === true,
          open: validTime(entry?.open) ? String(entry?.open) : defaultOpeningHours[day].open,
          close: validTime(entry?.close)
            ? String(entry?.close)
            : defaultOpeningHours[day].close
        }
      ];
    })
  ) as OpeningHours;
}

export function openingHoursFromFormData(formData: FormData): OpeningHours {
  return Object.fromEntries(
    weekDays.map((day) => [
      day,
      {
        closed: formData.get(`hours_${day}_closed`) === "on",
        open: validTime(formData.get(`hours_${day}_open`))
          ? String(formData.get(`hours_${day}_open`))
          : defaultOpeningHours[day].open,
        close: validTime(formData.get(`hours_${day}_close`))
          ? String(formData.get(`hours_${day}_close`))
          : defaultOpeningHours[day].close
      }
    ])
  ) as OpeningHours;
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function restaurantClock(value: Date, timeZone = restaurantTimeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
    weekday: "long"
  }).formatToParts(value);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const day = String(values.get("weekday") ?? "Monday").toLowerCase() as WeekDay;
  const hour = Number(values.get("hour") ?? 0) % 24;
  const minute = Number(values.get("minute") ?? 0);

  return { day, minutes: hour * 60 + minute };
}

export function isRestaurantOpen(
  hoursEnabled: boolean | null | undefined,
  rawHours: unknown,
  value: Date = new Date(),
  timeZone = restaurantTimeZone
) {
  if (!hoursEnabled) {
    return true;
  }

  const hours = normalizeOpeningHours(rawHours);
  const clock = restaurantClock(value, timeZone);
  const currentIndex = weekDays.indexOf(clock.day);
  const today = hours[clock.day];

  if (!today.closed) {
    const opens = timeToMinutes(today.open);
    const closes = timeToMinutes(today.close);

    if (opens === closes) {
      return true;
    }

    if (closes > opens && clock.minutes >= opens && clock.minutes < closes) {
      return true;
    }

    if (closes < opens && clock.minutes >= opens) {
      return true;
    }
  }

  const previousDay = weekDays[(currentIndex + weekDays.length - 1) % weekDays.length];
  const previous = hours[previousDay];
  if (!previous.closed) {
    const previousOpens = timeToMinutes(previous.open);
    const previousCloses = timeToMinutes(previous.close);
    if (
      previousCloses < previousOpens &&
      clock.minutes < previousCloses
    ) {
      return true;
    }
  }

  return false;
}

export function formatOpeningTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function todayOpeningHours(
  rawHours: unknown,
  value: Date = new Date(),
  timeZone = restaurantTimeZone
) {
  const hours = normalizeOpeningHours(rawHours);
  const { day } = restaurantClock(value, timeZone);
  return { day, ...hours[day] };
}

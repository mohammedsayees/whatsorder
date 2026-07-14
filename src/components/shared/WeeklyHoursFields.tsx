import {
  normalizeOpeningHours,
  weekDayLabels,
  weekDays
} from "@/lib/opening-hours";

export function WeeklyHoursFields({
  canWrite = true,
  enabled,
  openingHours,
  timeZone = "Asia/Dubai"
}: {
  canWrite?: boolean;
  enabled: boolean;
  openingHours: unknown;
  timeZone?: string;
}) {
  const hours = normalizeOpeningHours(openingHours);

  return (
    <fieldset className="rounded-lg border border-stone-200 p-4">
      <legend className="px-1 text-sm font-bold">Restaurant timings</legend>
      <label className="mt-2 flex items-start gap-3">
        <input
          className="mt-1"
          defaultChecked={enabled}
          disabled={!canWrite}
          name="opening_hours_enabled"
          type="checkbox"
        />
        <span>
          <span className="block text-sm font-black">Use weekly opening hours</span>
          <span className="mt-1 block text-xs leading-5 text-stone-500">
            Checkout automatically closes outside these times. Overnight hours such as 6 PM–2 AM
            are supported.
          </span>
        </span>
      </label>

      <div className="mt-4 divide-y divide-stone-100">
        {weekDays.map((day) => (
          <div
            className="grid gap-2 py-3 sm:grid-cols-[110px_1fr_1fr_auto] sm:items-center"
            key={day}
          >
            <span className="text-sm font-black">{weekDayLabels[day]}</span>
            <label>
              <span className="sr-only">{weekDayLabels[day]} opening time</span>
              <input
                className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                defaultValue={hours[day].open}
                disabled={!canWrite}
                name={`hours_${day}_open`}
                type="time"
              />
            </label>
            <label>
              <span className="sr-only">{weekDayLabels[day]} closing time</span>
              <input
                className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                defaultValue={hours[day].close}
                disabled={!canWrite}
                name={`hours_${day}_close`}
                type="time"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-bold text-stone-600">
              <input
                defaultChecked={hours[day].closed}
                disabled={!canWrite}
                name={`hours_${day}_closed`}
                type="checkbox"
              />
              Closed
            </label>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs font-semibold text-stone-500">Timezone: {timeZone}</p>
    </fieldset>
  );
}

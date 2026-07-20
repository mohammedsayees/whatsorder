"use client";

import { useState } from "react";
import { UAE_EMIRATES, UAE_LOCATIONS, type Emirate } from "@/lib/jobs";

const inputClass = "focus-ring mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm";
const labelClass = "block text-sm font-bold text-stone-700";

export function JobLocationFields({ initialEmirate, initialCity }: { initialEmirate: Emirate; initialCity: string }) {
  const [emirate, setEmirate] = useState<Emirate>(initialEmirate);
  const cities = UAE_LOCATIONS[emirate] as readonly string[];
  const city = cities.includes(initialCity) ? initialCity : cities[0];
  return (
    <>
      <label className={labelClass}>Emirate
        <select className={inputClass} name="emirate" onChange={(event) => setEmirate(event.target.value as Emirate)} value={emirate}>
          {UAE_EMIRATES.map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label className={labelClass}>City
        <select className={inputClass} defaultValue={city} key={emirate} name="city">
          {cities.map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
    </>
  );
}

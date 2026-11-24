"use client";

import { useState } from "react";
import { riderTokenFromLink } from "@/lib/rider-native";

/** The app's start screen: paste the delivery link from WhatsApp. */
export function OpenDeliveryLinkForm() {
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <form
      className="mt-6"
      onSubmit={(event) => {
        event.preventDefault();
        const token = riderTokenFromLink(value, [window.location.host.toLowerCase()]);

        if (!token) {
          setProblem("That does not look like a delivery link. Copy it from the WhatsApp message.");
          return;
        }

        window.location.assign(`/rider/${token}`);
      }}
    >
      <label className="text-sm font-black text-stone-700" htmlFor="delivery-link">
        Delivery link
      </label>
      <input
        autoCapitalize="off"
        autoComplete="off"
        className="focus-ring mt-1 w-full rounded-xl border border-stone-300 px-4 py-3 font-semibold"
        id="delivery-link"
        inputMode="url"
        onChange={(event) => {
          setValue(event.target.value);
          setProblem(null);
        }}
        placeholder="Paste the link from WhatsApp"
        value={value}
      />
      {problem ? (
        <p className="mt-2 text-sm font-semibold text-rose-700" role="alert">
          {problem}
        </p>
      ) : null}
      <button
        className="focus-ring mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-leaf px-5 py-3 font-black text-white disabled:opacity-50"
        disabled={!value.trim()}
        type="submit"
      >
        Open delivery
      </button>
    </form>
  );
}

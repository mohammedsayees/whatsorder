"use client";

import { useState } from "react";

import { isTooLightForBrand } from "@/lib/poster/palette";

/**
 * The "Colour" radios of the Poster branding form. Touching the colour box
 * selects "Choose a colour" (it used to change nothing unless the owner also
 * switched the radio), and a very light pick explains that posters will use
 * a deeper shade of it.
 */
export function PosterColourChoice({
  brandColor,
  logoColor,
  canWrite
}: {
  brandColor: string | null;
  /** Shown in the colour box while the logo colour is in use. */
  logoColor: string;
  canWrite: boolean;
}) {
  const [source, setSource] = useState<"logo" | "custom">(brandColor ? "custom" : "logo");
  const [colour, setColour] = useState(brandColor ?? logoColor);
  const pickCustom = () => setSource("custom");

  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-bold">Colour</legend>
      <label className="mt-2 flex items-center gap-3">
        <input
          checked={source === "logo"}
          disabled={!canWrite}
          name="colour_source"
          onChange={() => setSource("logo")}
          type="radio"
          value="logo"
        />
        <span className="text-sm">Use my logo&apos;s colour</span>
      </label>
      <label className="mt-2 flex items-center gap-3">
        <input
          checked={source === "custom"}
          disabled={!canWrite}
          name="colour_source"
          onChange={pickCustom}
          type="radio"
          value="custom"
        />
        <span className="text-sm">Choose a colour</span>
        <input
          aria-label="Brand colour"
          className={`h-9 w-14 cursor-pointer rounded border border-stone-200 ${
            source === "custom" ? "" : "opacity-60"
          }`}
          disabled={!canWrite}
          name="poster_brand_color"
          onChange={(event) => {
            setColour(event.target.value);
            pickCustom();
          }}
          onClick={pickCustom}
          type="color"
          value={colour}
        />
      </label>
      {source === "custom" && isTooLightForBrand(colour) ? (
        <p className="mt-2 text-xs text-stone-500">
          This is a very light colour, so posters will use a deeper shade of it. Otherwise
          it would blend into the background.
        </p>
      ) : null}
    </fieldset>
  );
}

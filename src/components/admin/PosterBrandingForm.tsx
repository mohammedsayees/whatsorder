"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { updatePosterBrandingAction } from "@/app/admin/marketing/brand/actions";
import {
  buildPalette,
  isTooLightForBrand,
  normalizeHex,
  type PosterPalette
} from "@/lib/poster/palette";
import { schemeFor } from "@/lib/poster/scheme";
import {
  DEFAULT_POSTER_THEME,
  POSTER_THEMES,
  POSTER_THEME_IDS,
  type PosterTheme
} from "@/lib/poster/themes";

const SWATCHES: { key: keyof PosterPalette; label: string }[] = [
  { key: "primary", label: "Brand" },
  { key: "primaryDeep", label: "Deep" },
  { key: "secondary", label: "Highlight" },
  { key: "dark", label: "Dark" },
  { key: "light", label: "Paper" }
];

export type PosterBrandingSample = { name: string; priceLabel: string | null };

/**
 * Marketing → Brand look. The colour and default look for new posters, with
 * a live preview: the palette and a mini poster per look update as the owner
 * changes the colour, before saving. Colours come from the same pure rules
 * (palette.ts, scheme.ts) the poster renderer uses.
 */
export function PosterBrandingForm({
  brandColor,
  logoPalette,
  hasLogoColour,
  theme,
  restaurantName,
  sample,
  canWrite,
  saved,
  failed
}: {
  brandColor: string | null;
  /** Palette from the logo alone (or the default palette when it has no colour). */
  logoPalette: PosterPalette;
  hasLogoColour: boolean;
  theme: string | null;
  restaurantName: string;
  sample: PosterBrandingSample;
  canWrite: boolean;
  saved: boolean;
  failed: boolean;
}) {
  const [source, setSource] = useState<"logo" | "custom">(brandColor ? "custom" : "logo");
  const [colour, setColour] = useState(brandColor ?? logoPalette.primary);
  const [selectedTheme, setSelectedTheme] = useState(
    theme && theme in POSTER_THEMES ? theme : DEFAULT_POSTER_THEME
  );

  const palette = useMemo(
    () => (source === "custom" ? buildPalette(normalizeHex(colour)) : logoPalette),
    [source, colour, logoPalette]
  );
  const sourceLabel =
    source === "custom"
      ? "From your chosen colour"
      : hasLogoColour
        ? "Picked from your logo"
        : "Default food palette (no colour found in your logo)";
  const pickCustom = () => setSource("custom");

  return (
    <form
      action={updatePosterBrandingAction}
      className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm"
    >
      <p className="text-sm text-stone-500">
        The colour and default look for new posters. Text colours are picked automatically so
        they stay readable. The previews update as you change things. Save to use them.
      </p>

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
            This is a very light colour, so posters will use a deeper shade of it. Otherwise it
            would blend into the background.
          </p>
        ) : null}
      </fieldset>

      <div className="mt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
          Poster palette · {sourceLabel}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SWATCHES.map((swatch) => (
            <div className="flex flex-col items-center" key={swatch.key}>
              <span
                className="h-10 w-14 rounded-md border border-stone-200"
                style={{ backgroundColor: palette[swatch.key] }}
              />
              <span className="mt-1 text-[11px] text-stone-500">{swatch.label}</span>
            </div>
          ))}
        </div>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-bold">Default look</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {POSTER_THEME_IDS.map((id) => (
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 p-3 has-[:checked]:border-leaf has-[:checked]:bg-mint"
              key={id}
            >
              <MiniPoster
                palette={palette}
                restaurantName={restaurantName}
                sample={sample}
                theme={POSTER_THEMES[id]}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <input
                    checked={selectedTheme === id}
                    disabled={!canWrite}
                    name="poster_theme"
                    onChange={() => setSelectedTheme(id)}
                    type="radio"
                    value={id}
                  />
                  <span className="text-sm font-black">{POSTER_THEMES[id].label}</span>
                </span>
                <span className="mt-1 block text-xs leading-5 text-stone-500">
                  {POSTER_THEMES[id].description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {saved ? (
        <p className="mt-4 rounded-lg bg-mint p-3 text-sm font-semibold text-leaf">
          Brand look saved. New posters use it.
        </p>
      ) : null}
      {failed ? (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
          Brand look couldn&apos;t be saved. Try again.
        </p>
      ) : null}

      <button
        className="focus-ring mt-4 rounded-lg bg-ink px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
        disabled={!canWrite}
        type="submit"
      >
        Save brand look
      </button>
    </form>
  );
}

// Poster fonts are only loaded by the server renderer; the preview uses
// close system stand-ins.
function previewFont(theme: PosterTheme): string {
  if (theme.display.family.startsWith("Anton")) return 'Impact, "Arial Narrow", sans-serif';
  if (theme.display.family.startsWith("DM Serif")) return 'Georgia, "Times New Roman", serif';
  return "inherit";
}

function textureStyle(theme: PosterTheme, colour: string): CSSProperties {
  switch (theme.texture) {
    case "dots":
      return {
        backgroundImage: `radial-gradient(${colour} 1px, transparent 1.5px)`,
        backgroundSize: "7px 7px",
        opacity: 0.22
      };
    case "stripes":
      return {
        backgroundImage: `repeating-linear-gradient(135deg, ${colour} 0 4px, transparent 4px 12px)`,
        opacity: 0.1
      };
    case "grid":
      return {
        backgroundImage: `linear-gradient(${colour} 1px, transparent 1px), linear-gradient(90deg, ${colour} 1px, transparent 1px)`,
        backgroundSize: "12px 12px",
        opacity: 0.12
      };
    default:
      return {};
  }
}

const STAMP_SHAPE: Record<PosterTheme["stamp"], CSSProperties> = {
  starburst: {
    clipPath:
      "polygon(50% 0%, 61% 18%, 82% 10%, 79% 32%, 100% 40%, 84% 56%, 96% 76%, 74% 78%, 68% 100%, 50% 87%, 32% 100%, 26% 78%, 4% 76%, 16% 56%, 0% 40%, 21% 32%, 18% 10%, 39% 18%)",
    width: 34,
    height: 34
  },
  tag: { borderRadius: 4, transform: "rotate(-8deg)", padding: "2px 5px" },
  badge: { borderRadius: 999, padding: "2px 6px" },
  seal: { borderRadius: 999, width: 30, height: 30, outline: "1px solid currentColor", outlineOffset: -3 }
};

/** A small, decorative stand-in for a poster in `theme` with `palette`. */
function MiniPoster({
  palette,
  theme,
  restaurantName,
  sample
}: {
  palette: PosterPalette;
  theme: PosterTheme;
  restaurantName: string;
  sample: PosterBrandingSample;
}) {
  const scheme = schemeFor(palette, theme, "hero");
  const display: CSSProperties = {
    fontFamily: previewFont(theme),
    fontWeight: theme.display.weight === 700 ? 800 : 400,
    textTransform: theme.display.transform,
    lineHeight: 1
  };
  const outline = theme.ornament === "outline";

  return (
    <span
      aria-hidden="true"
      className="relative flex h-[120px] w-24 shrink-0 flex-col overflow-hidden rounded-md shadow-sm ring-1 ring-black/10"
      style={{ backgroundColor: scheme.bg, color: scheme.text }}
    >
      <span className="absolute inset-0" style={textureStyle(theme, scheme.text)} />
      <span
        className="absolute -right-5 -top-5 h-14 w-14 rounded-full"
        style={
          outline
            ? { border: `2px solid ${scheme.decoA}` }
            : { backgroundColor: scheme.decoA }
        }
      />
      {theme.frame ? (
        <span
          className="absolute inset-1.5 rounded-sm"
          style={{ border: `1px solid ${scheme.accent}` }}
        />
      ) : null}
      <span className="relative truncate px-2 pt-2 text-[7px] font-bold opacity-80">
        {restaurantName}
      </span>
      <span className="relative mt-auto px-2">
        <span
          className="inline-flex items-center justify-center text-[7px] font-black"
          style={{ ...STAMP_SHAPE[theme.stamp], backgroundColor: scheme.stampFill, color: scheme.stampText }}
        >
          NEW
        </span>
        <span className="mt-1 line-clamp-2 block text-[13px]" style={display}>
          {sample.name}
        </span>
        {sample.priceLabel ? (
          <span className="mt-0.5 block text-[10px] font-black" style={{ color: scheme.accent }}>
            {sample.priceLabel}
          </span>
        ) : null}
      </span>
      <span className="relative mx-2 mb-2 mt-1.5 rounded-sm bg-[#25d366] py-0.5 text-center text-[6px] font-black text-white">
        Order on WhatsApp
      </span>
    </span>
  );
}

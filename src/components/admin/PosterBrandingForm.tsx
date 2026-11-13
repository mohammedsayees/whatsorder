import { updatePosterBrandingAction } from "@/app/admin/settings/actions";
import type { PosterPalette } from "@/lib/poster/palette";
import { POSTER_THEMES, POSTER_THEME_IDS, DEFAULT_POSTER_THEME } from "@/lib/poster/themes";
import type { PaletteSource } from "@/lib/poster/subjects";

const SOURCE_LABEL: Record<PaletteSource, string> = {
  brand_color: "From your chosen colour",
  logo: "Picked from your logo",
  default: "Default food palette (no colour found in your logo)"
};

const SWATCHES: { key: keyof PosterPalette; label: string }[] = [
  { key: "primary", label: "Brand" },
  { key: "primaryDeep", label: "Deep" },
  { key: "secondary", label: "Highlight" },
  { key: "dark", label: "Dark" },
  { key: "light", label: "Paper" }
];

export function PosterBrandingForm({
  brandColor,
  theme,
  preview,
  canWrite,
  saved,
  failed
}: {
  brandColor: string | null;
  theme: string | null;
  preview: { palette: PosterPalette; source: PaletteSource };
  canWrite: boolean;
  saved: boolean;
  failed: boolean;
}) {
  const currentTheme = theme && theme in POSTER_THEMES ? theme : DEFAULT_POSTER_THEME;
  return (
    <form
      action={updatePosterBrandingAction}
      className="max-w-2xl scroll-mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm"
      id="poster-branding"
    >
      <h2 className="text-lg font-black">Poster branding</h2>
      <p className="mt-1 text-sm text-stone-500">
        Colours and the default look for posters made in Marketing. Text colours are picked
        automatically so they stay readable.
      </p>

      <fieldset className="mt-4">
        <legend className="text-sm font-bold">Colour</legend>
        <label className="mt-2 flex items-center gap-3">
          <input
            defaultChecked={!brandColor}
            disabled={!canWrite}
            name="colour_source"
            type="radio"
            value="logo"
          />
          <span className="text-sm">Use my logo&apos;s colour</span>
        </label>
        <label className="mt-2 flex items-center gap-3">
          <input
            defaultChecked={Boolean(brandColor)}
            disabled={!canWrite}
            name="colour_source"
            type="radio"
            value="custom"
          />
          <span className="text-sm">Choose a colour</span>
          <input
            aria-label="Brand colour"
            className="h-9 w-14 cursor-pointer rounded border border-stone-200"
            defaultValue={brandColor ?? preview.palette.primary}
            disabled={!canWrite}
            name="poster_brand_color"
            type="color"
          />
        </label>
      </fieldset>

      <div className="mt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
          Current poster palette · {SOURCE_LABEL[preview.source]}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SWATCHES.map((swatch) => (
            <div className="flex flex-col items-center" key={swatch.key}>
              <span
                className="h-10 w-14 rounded-md border border-stone-200"
                style={{ backgroundColor: preview.palette[swatch.key] }}
              />
              <span className="mt-1 text-[11px] text-stone-500">{swatch.label}</span>
            </div>
          ))}
        </div>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-bold">Default look</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {POSTER_THEME_IDS.map((id) => (
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 p-3 has-[:checked]:border-leaf has-[:checked]:bg-mint"
              key={id}
            >
              <input
                className="mt-1"
                defaultChecked={currentTheme === id}
                disabled={!canWrite}
                name="poster_theme"
                type="radio"
                value={id}
              />
              <span>
                <span className="block text-sm font-black">{POSTER_THEMES[id].label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-stone-500">
                  {POSTER_THEMES[id].description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {saved ? (
        <p className="mt-4 rounded-lg bg-mint p-3 text-sm font-semibold text-leaf">
          Poster branding saved. New posters use it.
        </p>
      ) : null}
      {failed ? (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
          Poster branding couldn&apos;t be saved. Try again.
        </p>
      ) : null}

      <button
        className="focus-ring mt-4 rounded-lg bg-ink px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
        disabled={!canWrite}
        type="submit"
      >
        Save poster branding
      </button>
    </form>
  );
}

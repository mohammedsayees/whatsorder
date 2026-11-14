import { describe, expect, it } from "vitest";

import { parsePosterBrandingForm } from "./branding-input";

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("parsePosterBrandingForm", () => {
  it("stores a chosen colour (lower-cased) and theme", () => {
    expect(
      parsePosterBrandingForm(
        form({ colour_source: "custom", poster_brand_color: "#1D4ED8", poster_theme: "dark_premium" })
      )
    ).toEqual({ poster_brand_color: "#1d4ed8", poster_theme: "dark_premium" });
  });

  it("clears the colour when the logo colour is chosen", () => {
    expect(
      parsePosterBrandingForm(form({ colour_source: "logo", poster_brand_color: "#1d4ed8" }))
        .poster_brand_color
    ).toBeNull();
  });

  it("drops anything invalid instead of storing it", () => {
    expect(
      parsePosterBrandingForm(
        form({ colour_source: "custom", poster_brand_color: "red; drop table", poster_theme: "neon" })
      )
    ).toEqual({ poster_brand_color: null, poster_theme: null });
  });
});

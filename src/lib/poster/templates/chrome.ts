// lib/poster/templates/chrome.ts
//
// Shared header/footer chrome so every template is on-brand the same way:
// tenant logo (or name in Bricolage 700 when the logo is missing), a template
// chip, and the WhatsApp ordering footer.

import { POSTER_COLORS } from "../types";
import type { PosterBranding } from "../types";
import { box, img, text, type PosterNode } from "./node";

const { ink, cream, mint, pine, amber } = POSTER_COLORS;

export function headerBar(
  branding: PosterBranding,
  chipLabel: string,
  tone: "light" | "dark",
  chip: { background: string; color: string } = { background: amber, color: ink }
): PosterNode {
  const nameColor = tone === "light" ? ink : cream;

  const brandMark = branding.logoDataUri
    ? img(branding.logoDataUri, {
        width: 120,
        height: 120,
        borderRadius: 60,
        objectFit: "cover"
      })
    : text(
        {
          fontFamily: "Bricolage Grotesque",
          fontWeight: 700,
          fontSize: 44,
          color: nameColor,
          maxWidth: 640,
          lineClamp: 1
        },
        branding.restaurantName
      );

  return box(
    {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "56px 64px 0 64px",
      width: "100%"
    },
    [
      brandMark,
      box(
        {
          backgroundColor: chip.background,
          borderRadius: 999,
          padding: "18px 32px"
        },
        [
          text(
            {
              fontFamily: "Geist Mono",
              fontSize: 28,
              letterSpacing: 4,
              color: chip.color
            },
            chipLabel
          )
        ]
      )
    ]
  );
}

export function footerBar(
  branding: PosterBranding,
  tone: "light" | "dark"
): PosterNode {
  const background = tone === "light" ? pine : cream;
  const primary = tone === "light" ? cream : ink;
  const secondary = tone === "light" ? mint : pine;

  return box(
    {
      marginTop: "auto",
      width: "100%",
      backgroundColor: background,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "44px 64px"
    },
    [
      text(
        {
          fontFamily: "Bricolage Grotesque",
          fontWeight: 700,
          fontSize: 40,
          color: primary
        },
        "Order on WhatsApp"
      ),
      text(
        {
          fontFamily: "Geist Mono",
          fontSize: 30,
          color: secondary,
          maxWidth: 480,
          lineClamp: 1
        },
        branding.restaurantName
      )
    ]
  );
}

/**
 * Color fields for the typographic designs. Each layout's photo-less
 * fallback lands on a different field, so a café with no photos still gets
 * three visually distinct posters per generation. Code-owned and finite —
 * never an owner-facing choice.
 */
export type PosterField = "pine" | "amber" | "ink";

export const FIELD_STYLES: Record<
  PosterField,
  {
    background: string;
    headline: string;
    subline: string;
    accent: string;
    headerTone: "light" | "dark";
    chip: { background: string; color: string };
    /** footerBar tone that contrasts with this field. */
    footerTone: "light" | "dark";
    /** itemCard/priceCard background that contrasts with this field. */
    card: "pine" | "cream";
  }
> = {
  pine: {
    background: pine,
    headline: cream,
    subline: mint,
    accent: amber,
    headerTone: "dark",
    chip: { background: amber, color: ink },
    footerTone: "dark",
    card: "cream"
  },
  amber: {
    background: amber,
    headline: ink,
    subline: ink,
    accent: pine,
    headerTone: "light",
    chip: { background: pine, color: cream },
    footerTone: "dark",
    card: "pine"
  },
  ink: {
    background: ink,
    headline: cream,
    subline: mint,
    accent: amber,
    headerTone: "dark",
    chip: { background: amber, color: ink },
    footerTone: "light",
    card: "cream"
  }
};

/**
 * Full-bleed photo backdrop: the image covers the entire frame with scrims
 * top and bottom so the header and content stay legible over any photo.
 * Place inside a position:relative root before the flowed children.
 */
export function fullBleedBackdrop(photoDataUri: string): PosterNode[] {
  return [
    img(photoDataUri, {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }),
    // Owner photos are often bright; a full-frame dim plus deep top/bottom
    // gradients keeps cream/mint type legible over ANY photo while leaving
    // the middle of the image visible.
    box(
      {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(23,32,27,0.30)"
      },
      []
    ),
    box(
      {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: 420,
        backgroundImage:
          "linear-gradient(180deg, rgba(23,32,27,0.75) 0%, rgba(23,32,27,0) 100%)"
      },
      []
    ),
    box(
      {
        position: "absolute",
        bottom: 0,
        left: 0,
        width: "100%",
        height: 1150,
        backgroundImage:
          "linear-gradient(0deg, rgba(23,32,27,0.95) 0%, rgba(23,32,27,0.82) 45%, rgba(23,32,27,0) 100%)"
      },
      []
    )
  ];
}

/**
 * Fixed photo window with object-fit-cover semantics — owner photo aspect
 * ratios are never trusted. Children overlay the photo (badges).
 */
export function photoWindow(
  photoDataUri: string,
  height: number,
  overlays: PosterNode[]
): PosterNode {
  return box(
    {
      position: "relative",
      width: "100%",
      height,
      overflow: "hidden",
      marginTop: 48
    },
    [
      img(photoDataUri, {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover"
      }),
      ...overlays
    ]
  );
}

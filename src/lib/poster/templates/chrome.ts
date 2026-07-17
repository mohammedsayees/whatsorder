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

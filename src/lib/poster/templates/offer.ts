// lib/poster/templates/offer.ts
//
// Offer / promo template — highest order intent. The price block is rendered
// verbatim from the offers table (priceLine / originalPriceLine are formatted
// server-side); the LLM contributes headline/subline only and never touches a
// price.
//
// Three compositions (one per generated variant, see layoutForVariant):
//   photo_hero — photo window on cream, price card below (fallback: amber type)
//   full_bleed — photo covers the frame, price over a scrim (fallback: pine type)
//   stat_led   — the price itself is the hero on ink (photo-less by design)

import { POSTER_COLORS } from "../types";
import type { PosterProps } from "../types";
import {
  FIELD_STYLES,
  fullBleedBackdrop,
  headerBar,
  footerBar,
  photoWindow,
  type PosterField
} from "./chrome";
import { box, fitFontSize, text, type PosterNode } from "./node";

const { ink, cream, mint, pine, amber } = POSTER_COLORS;

export function offerTemplate(props: PosterProps): PosterNode {
  const photo = props.subject.photoDataUri;
  switch (props.layout) {
    case "full_bleed":
      return photo ? fullBleedVariant(props, photo) : typographicVariant(props, "pine");
    case "stat_led":
      return priceLedVariant(props);
    default:
      return photo ? photoVariant(props, photo) : typographicVariant(props, "amber");
  }
}

/** Card: offer title + struck original price + big promotional price. */
function priceCard(
  props: PosterProps,
  background: "pine" | "cream" = "pine"
): PosterNode {
  const onPine = background === "pine";
  return box(
    {
      flexDirection: "column",
      backgroundColor: onPine ? pine : cream,
      borderRadius: 32,
      padding: "44px 48px",
      width: "100%"
    },
    [
      text(
        {
          fontFamily: "Bricolage Grotesque",
          fontWeight: 700,
          fontSize: fitFontSize(52, props.subject.title, 26),
          color: onPine ? cream : ink,
          lineClamp: 2
        },
        props.subject.title
      ),
      box(
        {
          flexDirection: "row",
          alignItems: "flex-end",
          marginTop: 28
        },
        [
          props.subject.priceLine
            ? text(
                {
                  fontFamily: "Bricolage Grotesque",
                  fontWeight: 700,
                  fontSize: 96,
                  lineHeight: 1,
                  color: onPine ? amber : pine
                },
                props.subject.priceLine
              )
            : null,
          props.subject.originalPriceLine
            ? text(
                {
                  fontFamily: "Geist Mono",
                  fontSize: 40,
                  color: onPine ? mint : ink,
                  opacity: onPine ? 0.8 : 0.5,
                  textDecoration: "line-through",
                  marginLeft: 32,
                  marginBottom: 10
                },
                props.subject.originalPriceLine
              )
            : null
        ]
      )
    ]
  );
}

// ── photo_hero ──────────────────────────────────────────────────────────────

function photoVariant(props: PosterProps, photoDataUri: string): PosterNode {
  return box(
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: cream
    },
    [
      headerBar(props.branding, "LIMITED OFFER", "light"),
      photoWindow(photoDataUri, 800, []),
      box(
        {
          flexDirection: "column",
          padding: "56px 64px 48px 64px",
          width: "100%"
        },
        [
          text(
            {
              fontFamily: "Bricolage Grotesque",
              fontWeight: 700,
              fontSize: fitFontSize(88, props.copy.headline, 24),
              lineHeight: 1.05,
              color: ink,
              lineClamp: 2
            },
            props.copy.headline
          ),
          text(
            {
              fontFamily: "Bricolage Grotesque",
              fontSize: 42,
              lineHeight: 1.3,
              color: ink,
              opacity: 0.75,
              marginTop: 24,
              lineClamp: 2
            },
            props.copy.subline
          ),
          box({ marginTop: 44, width: "100%" }, [priceCard(props)])
        ]
      ),
      footerBar(props.branding, "light")
    ]
  );
}

// ── full_bleed ──────────────────────────────────────────────────────────────

function fullBleedVariant(props: PosterProps, photoDataUri: string): PosterNode {
  return box(
    {
      position: "relative",
      width: "100%",
      height: "100%",
      flexDirection: "column"
    },
    [
      ...fullBleedBackdrop(photoDataUri),
      headerBar(props.branding, "LIMITED OFFER", "dark"),
      box(
        {
          flexDirection: "column",
          padding: "0 64px 56px 64px",
          width: "100%",
          marginTop: "auto"
        },
        [
          text(
            {
              fontFamily: "Bricolage Grotesque",
              fontWeight: 700,
              fontSize: fitFontSize(104, props.copy.headline, 22),
              lineHeight: 1.03,
              color: cream,
              lineClamp: 3,
              // See bestseller full_bleed: guarantees contrast where the
              // scrim has faded but the photo is bright.
              textShadow: "0 4px 36px rgba(23,32,27,0.95)"
            },
            props.copy.headline
          ),
          text(
            {
              fontFamily: "Bricolage Grotesque",
              fontSize: 44,
              lineHeight: 1.3,
              color: mint,
              marginTop: 28,
              lineClamp: 2,
              textShadow: "0 3px 24px rgba(23,32,27,0.95)"
            },
            props.copy.subline
          ),
          box({ marginTop: 52, width: "100%" }, [priceCard(props)])
        ]
      ),
      footerBar(props.branding, "light")
    ]
  );
}

// ── stat_led (price hero) ───────────────────────────────────────────────────

/** Fit a short data string (the price) to the content width. */
function heroFontSize(value: string, base: number): number {
  const maxWidth = 952; // 1080 − 2×64 padding
  const approxCharWidth = 0.62;
  return Math.min(base, Math.floor(maxWidth / (approxCharWidth * value.length)));
}

function priceLedVariant(props: PosterProps): PosterNode {
  const price = props.subject.priceLine;
  return box(
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: ink
    },
    [
      headerBar(props.branding, "LIMITED OFFER", "dark"),
      box(
        {
          flexDirection: "column",
          padding: "110px 64px 0 64px",
          width: "100%",
          flexGrow: 1
        },
        [
          text(
            {
              fontFamily: "Bricolage Grotesque",
              fontWeight: 700,
              fontSize: fitFontSize(72, props.subject.title, 24),
              lineHeight: 1.08,
              color: cream,
              lineClamp: 2
            },
            props.subject.title
          ),
          price
            ? text(
                {
                  fontFamily: "Bricolage Grotesque",
                  fontWeight: 700,
                  fontSize: heroFontSize(price, 240),
                  lineHeight: 1,
                  color: amber,
                  marginTop: 48
                },
                price
              )
            : null,
          props.subject.originalPriceLine
            ? text(
                {
                  fontFamily: "Geist Mono",
                  fontSize: 44,
                  color: mint,
                  opacity: 0.75,
                  textDecoration: "line-through",
                  marginTop: 24
                },
                props.subject.originalPriceLine
              )
            : null,
          text(
            {
              fontFamily: "Bricolage Grotesque",
              fontSize: 44,
              lineHeight: 1.35,
              color: mint,
              marginTop: 48,
              lineClamp: 2
            },
            props.copy.subline
          ),
          box({ marginTop: "auto", width: "100%", paddingBottom: 72 }, [
            box(
              {
                backgroundColor: cream,
                borderRadius: 32,
                padding: "36px 44px",
                width: "100%"
              },
              [
                text(
                  {
                    fontFamily: "Bricolage Grotesque",
                    fontWeight: 700,
                    fontSize: fitFontSize(48, props.copy.headline, 26),
                    color: ink,
                    lineClamp: 2
                  },
                  props.copy.headline
                )
              ]
            )
          ])
        ]
      ),
      footerBar(props.branding, "light")
    ]
  );
}

// ── typographic fallbacks (field-parameterized) ─────────────────────────────

function typographicVariant(props: PosterProps, field: PosterField): PosterNode {
  const styles = FIELD_STYLES[field];
  return box(
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: styles.background
    },
    [
      headerBar(props.branding, "LIMITED OFFER", styles.headerTone, styles.chip),
      box(
        {
          flexDirection: "column",
          padding: "110px 64px 0 64px",
          width: "100%",
          flexGrow: 1
        },
        [
          box(
            {
              width: 220,
              height: 16,
              backgroundColor: styles.accent,
              borderRadius: 8
            },
            []
          ),
          text(
            {
              fontFamily: "Bricolage Grotesque",
              fontWeight: 700,
              fontSize: fitFontSize(116, props.copy.headline, 20),
              lineHeight: 1.02,
              color: styles.headline,
              marginTop: 52,
              lineClamp: 3
            },
            props.copy.headline
          ),
          text(
            {
              fontFamily: "Bricolage Grotesque",
              fontSize: 46,
              lineHeight: 1.35,
              color: styles.subline,
              opacity: field === "amber" ? 0.8 : 1,
              marginTop: 40,
              lineClamp: 2
            },
            props.copy.subline
          ),
          box({ marginTop: "auto", width: "100%", paddingBottom: 72 }, [
            priceCard(props, styles.card)
          ])
        ]
      ),
      footerBar(props.branding, styles.footerTone)
    ]
  );
}

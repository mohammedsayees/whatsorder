// lib/poster/templates/bestseller.ts
//
// Bestseller / social-proof template — the anti-silence template: with
// get_bestsellers' cold-start fallback it always has something to say.
//
// Three compositions (one per generated variant, see layoutForVariant):
//   photo_hero — photo window on cream, headline below (fallback: pine type)
//   full_bleed — photo covers the frame, content over a scrim (fallback: ink type)
//   stat_led   — the sold count is the hero on amber (photo-less by design)
// Fallback fields differ (pine / ink / amber) so photo-less tenants still
// get three visually distinct posters.

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

export function bestsellerTemplate(props: PosterProps): PosterNode {
  const photo = props.subject.photoDataUri;
  switch (props.layout) {
    case "full_bleed":
      return photo ? fullBleedVariant(props, photo) : typographicVariant(props, "ink");
    case "stat_led":
      return statLedVariant(props);
    default:
      return photo ? photoVariant(props, photo) : typographicVariant(props, "pine");
  }
}

function soldChip(
  soldQty: number | null,
  colors: { background: string; color: string },
  extraStyle: Record<string, string | number> = {}
): PosterNode | null {
  if (!soldQty || soldQty <= 0) {
    return null;
  }
  return box(
    {
      backgroundColor: colors.background,
      borderRadius: 999,
      padding: "18px 32px",
      alignSelf: "flex-start",
      ...extraStyle
    },
    [
      text(
        { fontFamily: "Geist Mono", fontSize: 30, color: colors.color },
        `${soldQty}+ sold this month`
      )
    ]
  );
}

function itemCard(props: PosterProps, background: string): PosterNode {
  const onPine = background === pine;
  return box(
    {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: background,
      borderRadius: 32,
      padding: "36px 44px",
      width: "100%"
    },
    [
      text(
        {
          fontFamily: "Bricolage Grotesque",
          fontWeight: 700,
          fontSize: fitFontSize(52, props.subject.title, 22),
          color: onPine ? cream : ink,
          maxWidth: props.subject.priceLine ? 640 : 900,
          lineClamp: 2
        },
        props.subject.title
      ),
      props.subject.priceLine
        ? box(
            {
              backgroundColor: amber,
              borderRadius: 999,
              padding: "20px 36px"
            },
            [
              text(
                {
                  fontFamily: "Bricolage Grotesque",
                  fontWeight: 700,
                  fontSize: 44,
                  color: ink
                },
                props.subject.priceLine
              )
            ]
          )
        : null
    ]
  );
}

// ── photo_hero ──────────────────────────────────────────────────────────────

function photoVariant(props: PosterProps, photoDataUri: string): PosterNode {
  const badge = soldChip(props.subject.soldQty, {
    background: pine,
    color: cream
  }, { position: "absolute", left: 64, bottom: 48 });
  return box(
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: cream
    },
    [
      headerBar(props.branding, "BESTSELLER", "light"),
      photoWindow(photoDataUri, 900, badge ? [badge] : []),
      box(
        {
          flexDirection: "column",
          padding: "64px 64px 48px 64px",
          width: "100%"
        },
        [
          text(
            {
              fontFamily: "Bricolage Grotesque",
              fontWeight: 700,
              fontSize: fitFontSize(92, props.copy.headline, 24),
              lineHeight: 1.05,
              color: ink,
              lineClamp: 2
            },
            props.copy.headline
          ),
          text(
            {
              fontFamily: "Bricolage Grotesque",
              fontSize: 44,
              lineHeight: 1.3,
              color: ink,
              opacity: 0.75,
              marginTop: 28,
              lineClamp: 2
            },
            props.copy.subline
          ),
          box({ marginTop: 48, width: "100%" }, [itemCard(props, pine)])
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
      headerBar(props.branding, "BESTSELLER", "dark"),
      box(
        {
          flexDirection: "column",
          padding: "0 64px 56px 64px",
          width: "100%",
          marginTop: "auto"
        },
        [
          soldChip(props.subject.soldQty, { background: amber, color: ink }),
          text(
            {
              fontFamily: "Bricolage Grotesque",
              fontWeight: 700,
              fontSize: fitFontSize(104, props.copy.headline, 22),
              lineHeight: 1.03,
              color: cream,
              marginTop: 40,
              lineClamp: 3,
              // The headline can land over the photo's brightest region;
              // the scrim alone can't guarantee contrast there.
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
          box({ marginTop: 52, width: "100%" }, [itemCard(props, pine)])
        ]
      ),
      footerBar(props.branding, "light")
    ]
  );
}

// ── stat_led ────────────────────────────────────────────────────────────────

/** Fit a short data string (the stat) to the content width. */
function heroFontSize(value: string, base: number): number {
  const maxWidth = 952; // 1080 − 2×64 padding
  const approxCharWidth = 0.62;
  return Math.min(base, Math.floor(maxWidth / (approxCharWidth * value.length)));
}

function statLedVariant(props: PosterProps): PosterNode {
  const soldQty = props.subject.soldQty;
  const stat = soldQty && soldQty > 0 ? `${soldQty}+` : null;

  const hero = stat
    ? [
        text(
          {
            fontFamily: "Bricolage Grotesque",
            fontWeight: 700,
            fontSize: heroFontSize(stat, 330),
            lineHeight: 1,
            color: ink
          },
          stat
        ),
        text(
          {
            fontFamily: "Geist Mono",
            fontSize: 34,
            letterSpacing: 4,
            color: pine,
            marginTop: 16
          },
          "SOLD THIS MONTH"
        ),
        text(
          {
            fontFamily: "Bricolage Grotesque",
            fontWeight: 700,
            fontSize: fitFontSize(76, props.copy.headline, 26),
            lineHeight: 1.08,
            color: ink,
            marginTop: 56,
            lineClamp: 2
          },
          props.copy.headline
        )
      ]
    : [
        // Cold start: no number to lead with — the headline is the hero.
        text(
          {
            fontFamily: "Bricolage Grotesque",
            fontWeight: 700,
            fontSize: fitFontSize(116, props.copy.headline, 20),
            lineHeight: 1.03,
            color: ink,
            lineClamp: 3
          },
          props.copy.headline
        )
      ];

  return box(
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: amber
    },
    [
      headerBar(props.branding, "BESTSELLER", "light", {
        background: pine,
        color: cream
      }),
      box(
        {
          flexDirection: "column",
          padding: "110px 64px 0 64px",
          width: "100%",
          flexGrow: 1
        },
        [
          box(
            { width: 220, height: 16, backgroundColor: pine, borderRadius: 8 },
            []
          ),
          box({ flexDirection: "column", marginTop: 52, width: "100%" }, hero),
          text(
            {
              fontFamily: "Bricolage Grotesque",
              fontSize: 44,
              lineHeight: 1.35,
              color: ink,
              opacity: 0.8,
              marginTop: 36,
              lineClamp: 2
            },
            props.copy.subline
          ),
          box({ marginTop: "auto", width: "100%", paddingBottom: 72 }, [
            itemCard(props, pine)
          ])
        ]
      ),
      footerBar(props.branding, "dark")
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
      headerBar(props.branding, "BESTSELLER", styles.headerTone, styles.chip),
      box(
        {
          flexDirection: "column",
          padding: "120px 64px 0 64px",
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
              fontSize: fitFontSize(120, props.copy.headline, 20),
              lineHeight: 1.02,
              color: styles.headline,
              marginTop: 56,
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
              marginTop: 44,
              opacity: field === "amber" ? 0.8 : 1,
              lineClamp: 2
            },
            props.copy.subline
          ),
          soldChip(
            props.subject.soldQty,
            field === "ink"
              ? { background: "rgba(246, 182, 66, 0.18)", color: amber }
              : { background: "rgba(232, 247, 239, 0.16)", color: cream },
            { marginTop: 56 }
          ),
          box({ marginTop: "auto", width: "100%", paddingBottom: 72 }, [
            itemCard(props, styles.card === "pine" ? pine : cream)
          ])
        ]
      ),
      footerBar(props.branding, styles.footerTone)
    ]
  );
}

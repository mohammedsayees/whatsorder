// lib/poster/templates/offer.ts
//
// Offer / promo template — highest order intent. The price block is rendered
// verbatim from the offers table (priceLine / originalPriceLine are formatted
// server-side); the LLM contributes headline/subline only and never touches a
// price. Photo variant on cream; typographic variant leads with the price.

import { POSTER_COLORS } from "../types";
import type { PosterProps } from "../types";
import { headerBar, footerBar, photoWindow } from "./chrome";
import { box, fitFontSize, text, type PosterNode } from "./node";

const { ink, cream, mint, pine, amber } = POSTER_COLORS;

export function offerTemplate(props: PosterProps): PosterNode {
  return props.subject.photoDataUri
    ? photoVariant(props, props.subject.photoDataUri)
    : typographicVariant(props);
}

/** Pine card: offer title + struck original price + big promotional price. */
function priceCard(props: PosterProps): PosterNode {
  return box(
    {
      flexDirection: "column",
      backgroundColor: pine,
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
          color: cream,
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
                  color: amber
                },
                props.subject.priceLine
              )
            : null,
          props.subject.originalPriceLine
            ? text(
                {
                  fontFamily: "Geist Mono",
                  fontSize: 40,
                  color: mint,
                  opacity: 0.8,
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

function typographicVariant(props: PosterProps): PosterNode {
  return box(
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: amber
    },
    [
      // Pine chip: the default amber chip would vanish on the amber field.
      headerBar(props.branding, "LIMITED OFFER", "light", {
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
          text(
            {
              fontFamily: "Bricolage Grotesque",
              fontWeight: 700,
              fontSize: fitFontSize(116, props.copy.headline, 20),
              lineHeight: 1.02,
              color: ink,
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
              color: ink,
              opacity: 0.8,
              marginTop: 40,
              lineClamp: 2
            },
            props.copy.subline
          ),
          box({ marginTop: "auto", width: "100%", paddingBottom: 72 }, [
            priceCard(props)
          ])
        ]
      ),
      footerBar(props.branding, "dark")
    ]
  );
}

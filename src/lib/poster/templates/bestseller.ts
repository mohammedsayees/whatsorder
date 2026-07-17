// lib/poster/templates/bestseller.ts
//
// Bestseller / social-proof template — the anti-silence template: with
// get_bestsellers' cold-start fallback it always has something to say.
// Photo variant on cream; typographic variant (no/unusable photo) goes
// large-type on pine, mirroring the same cold-start instinct.

import { POSTER_COLORS } from "../types";
import type { PosterProps } from "../types";
import { headerBar, footerBar, photoWindow } from "./chrome";
import { box, fitFontSize, text, type PosterNode } from "./node";

const { ink, cream, mint, pine, amber } = POSTER_COLORS;

export function bestsellerTemplate(props: PosterProps): PosterNode {
  return props.subject.photoDataUri
    ? photoVariant(props, props.subject.photoDataUri)
    : typographicVariant(props);
}

function soldBadge(soldQty: number | null): PosterNode | null {
  if (!soldQty || soldQty <= 0) {
    return null;
  }
  return box(
    {
      position: "absolute",
      left: 64,
      bottom: 48,
      backgroundColor: pine,
      borderRadius: 999,
      padding: "18px 32px"
    },
    [
      text(
        { fontFamily: "Geist Mono", fontSize: 30, color: cream },
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

function photoVariant(props: PosterProps, photoDataUri: string): PosterNode {
  const badge = soldBadge(props.subject.soldQty);
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

function typographicVariant(props: PosterProps): PosterNode {
  return box(
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: pine
    },
    [
      headerBar(props.branding, "BESTSELLER", "dark"),
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
              backgroundColor: amber,
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
              color: cream,
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
              color: mint,
              marginTop: 44,
              lineClamp: 2
            },
            props.copy.subline
          ),
          props.subject.soldQty && props.subject.soldQty > 0
            ? box(
                {
                  marginTop: 56,
                  backgroundColor: "rgba(232, 247, 239, 0.16)",
                  borderRadius: 999,
                  padding: "18px 36px",
                  alignSelf: "flex-start"
                },
                [
                  text(
                    { fontFamily: "Geist Mono", fontSize: 30, color: cream },
                    `${props.subject.soldQty}+ sold this month`
                  )
                ]
              )
            : null,
          box({ marginTop: "auto", width: "100%", paddingBottom: 72 }, [
            itemCard(props, cream)
          ])
        ]
      ),
      footerBar(props.branding, "dark")
    ]
  );
}

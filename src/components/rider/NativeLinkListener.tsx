"use client";

import { useEffect } from "react";
import { isRiderApp, riderTokenFromLink, watchAppLinks } from "@/lib/rider-native";

/**
 * Inside the WhatsOrder Rider app only: when the rider taps a delivery link
 * (the app's own `whatsorder-rider://` link, or the https link from WhatsApp
 * once the app is the default handler), open that delivery. Does nothing in a
 * browser.
 */
export function NativeLinkListener({ currentToken }: { currentToken?: string }) {
  useEffect(() => {
    if (!isRiderApp()) {
      return;
    }

    let stop: (() => void) | undefined;
    let cancelled = false;

    void watchAppLinks((link) => {
      const token = riderTokenFromLink(link, [window.location.host.toLowerCase()]);

      if (token && token !== currentToken) {
        window.location.assign(`/rider/${token}`);
      }
    })
      .then((remove) => {
        if (cancelled) {
          remove();
        } else {
          stop = remove;
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [currentToken]);

  return null;
}

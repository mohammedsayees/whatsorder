"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { customerTranslations, type CustomerLanguage } from "@/lib/customer-i18n";

// Chrome-family browsers fire this before showing their own install UI; iOS
// Safari never does, so that path shows manual instructions instead.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * "Install app" pill on the café header. Renders nothing when the PWA is
 * already installed (standalone display mode). Browsers with a native install
 * prompt use it; every other browser keeps the pill visible and shows manual
 * instructions instead.
 */
export function InstallAppPrompt({ language }: { language: CustomerLanguage }) {
  const t = customerTranslations[language];
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [showInstallHint, setShowInstallHint] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (standalone) {
      setInstalled(true);
      setReady(true);
      return;
    }

    const ua = window.navigator.userAgent;
    // iPadOS 13+ reports a Macintosh UA; the touch check catches it.
    const ios =
      /iphone|ipad|ipod/i.test(ua) ||
      (ua.includes("Mac") && window.navigator.maxTouchPoints > 1);
    setIsIos(ios);
    setReady(true);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setShowInstallHint(false);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!ready || installed) {
    return null;
  }

  const handleClick = async () => {
    if (installEvent) {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;

      // The stashed event is single-use; drop it so a dismissed prompt
      // cannot be invoked twice. Keep the button useful after dismissal by
      // falling back to browser-menu instructions.
      setInstallEvent(null);
      if (choice.outcome === "accepted") {
        setInstalled(true);
      } else {
        setShowInstallHint(true);
      }
      return;
    }

    setShowInstallHint((current) => !current);
  };

  return (
    <div className="mt-4">
      <button
        className="focus-ring inline-flex items-center gap-2 rounded-full bg-mint/15 px-3.5 py-2 text-sm font-black text-leaf"
        onClick={handleClick}
        type="button"
      >
        <Download size={15} />
        {t.installApp}
      </button>
      {showInstallHint ? (
        <p className="mt-2 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-600">
          {isIos ? t.installAppIosHint : t.installAppBrowserHint}
        </p>
      ) : null}
    </div>
  );
}

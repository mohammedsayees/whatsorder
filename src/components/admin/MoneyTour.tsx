"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MONEY_TOUR_STORAGE_KEY, type MoneyTourStep } from "@/lib/finance-simple";

function hasSeenTour() {
  try {
    return window.localStorage.getItem(MONEY_TOUR_STORAGE_KEY) === "done";
  } catch {
    // Storage blocked (private mode etc.): don't nag on every visit.
    return true;
  }
}

function markTourSeen() {
  try {
    window.localStorage.setItem(MONEY_TOUR_STORAGE_KEY, "done");
  } catch {
    // Ignore: the tour simply shows again next time.
  }
}

const HIGHLIGHT_STYLE: Partial<CSSStyleDeclaration> = {
  position: "relative",
  zIndex: "61",
  boxShadow: "0 0 0 4px #ffffff, 0 0 0 8px #1f8a5b",
  borderRadius: "16px",
  backgroundColor: "#ffffff"
};

/**
 * Short first-visit tour of the Money home. Elements to highlight carry a
 * data-tour="…" attribute. Shown once per device; replay from the link.
 */
export function MoneyTour({ steps }: { steps: MoneyTourStep[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const highlighted = useRef<{ element: HTMLElement; previous: string } | null>(null);

  const clearHighlight = useCallback(() => {
    if (highlighted.current) {
      highlighted.current.element.setAttribute("style", highlighted.current.previous);
      highlighted.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    clearHighlight();
    markTourSeen();
    setIndex(null);
  }, [clearHighlight]);

  // Start automatically on the first visit.
  useEffect(() => {
    if (steps.length > 0 && !hasSeenTour()) {
      const timer = window.setTimeout(() => setIndex(0), 400);
      return () => window.clearTimeout(timer);
    }
  }, [steps.length]);

  // Highlight and scroll to the current step's element.
  useEffect(() => {
    clearHighlight();
    if (index === null) return;
    nextRef.current?.focus();
    const target = steps[index]?.target;
    if (!target) return;
    const element = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
    if (!element) return;
    highlighted.current = { element, previous: element.getAttribute("style") ?? "" };
    Object.assign(element.style, HIGHLIGHT_STYLE);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Keep it near the top: the tour card covers the bottom of the screen.
    const top = element.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? "auto" : "smooth" });
  }, [index, steps, clearHighlight]);

  useEffect(() => clearHighlight, [clearHighlight]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, finish]);

  const step = index === null ? null : steps[index];
  const last = index !== null && index === steps.length - 1;

  return (
    <>
      <p className="mt-6 text-center">
        <button className="focus-ring text-sm font-bold text-leaf underline" onClick={() => setIndex(0)} type="button">
          👋 Show me how this page works
        </button>
      </p>
      {step ? (
        <>
          {/* Room to scroll the last items above the tour card. */}
          <div aria-hidden className="h-[60vh]" />
          <div aria-hidden className="fixed inset-0 z-[60] bg-black/50" />
          <div
            aria-labelledby="money-tour-title"
            aria-modal="true"
            className="fixed inset-x-3 bottom-3 z-[62] mx-auto max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:bottom-6"
            role="dialog"
          >
            <p className="text-xs font-bold text-stone-500">Step {index! + 1} of {steps.length}</p>
            <h2 className="mt-1 text-xl font-black text-ink" id="money-tour-title">{step.title}</h2>
            <p className="mt-2 text-base text-stone-700">{step.body}</p>
            <div aria-hidden className="mt-4 flex gap-1.5">
              {steps.map((item, dot) => (
                <span className={`h-1.5 flex-1 rounded-full ${dot <= index! ? "bg-leaf" : "bg-stone-200"}`} key={`${item.title}-${dot}`} />
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2">
              {!last ? (
                <button className="focus-ring rounded-lg px-3 py-3 text-sm font-bold text-stone-500" onClick={finish} type="button">Skip</button>
              ) : null}
              <span className="flex-1" />
              {index! > 0 ? (
                <button className="focus-ring rounded-xl border border-stone-300 px-4 py-3 text-sm font-black" onClick={() => setIndex(index! - 1)} type="button">Back</button>
              ) : null}
              <button
                className="focus-ring rounded-xl bg-leaf px-5 py-3 text-sm font-black text-white"
                onClick={() => (last ? finish() : setIndex(index! + 1))}
                ref={nextRef}
                type="button"
              >
                {last ? "Got it" : index === 0 ? "Show me" : "Next"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

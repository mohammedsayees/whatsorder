"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  CarFront,
  CheckCircle2,
  Loader2,
  LocateFixed,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
  ShoppingBag,
  Utensils
} from "lucide-react";
import { createOrderAction } from "@/app/r/[restaurantSlug]/checkout/actions";
import { cartLineKey, formatLineOptions } from "@/lib/cart-line";
import {
  ADDRESS_LIMITS,
  composeDeliveryAddress,
  parseSavedDetails,
  savedDetailsStorageKey,
  type SavedCustomerDetails
} from "@/lib/customer-address";
import { formatCurrency } from "@/lib/currency";
import { trackFunnel } from "@/lib/customer-funnel-client";
import { isRestaurantOpen } from "@/lib/opening-hours";
import { minimumOrderRemaining } from "@/lib/security";
import { onboardingOrdersHref } from "@/lib/onboarding-order-handoff";
import { customerTranslations, getTextDirection } from "@/lib/customer-i18n";
import { evaluateDeliveryRange } from "@/lib/geo";
import { useCart } from "@/components/customer/CartProvider";
import { FulfilmentSelector } from "@/components/customer/FulfilmentSelector";
import { InstallAppPrompt } from "@/components/customer/InstallAppPrompt";
import { LanguageToggle } from "@/components/customer/LanguageToggle";
import { OrderPushPrompt } from "@/components/customer/OrderPushPrompt";
import { useCustomerLanguage } from "@/components/customer/useCustomerLanguage";
import { useFulfilmentPreference } from "@/components/customer/useFulfilmentPreference";
import type { CustomerProfile } from "@/lib/customer-auth/context";
import type { FulfilmentType, PublicRestaurant } from "@/lib/types";

type CapturedLocation = {
  latitude: number;
  longitude: number;
  mapsUrl: string;
};

// Checkout-only copy, kept out of customer-i18n so the menu bundle stays small.
const ADDRESS_COPY = {
  en: {
    building: "Building or villa",
    buildingPlaceholder: "Al Noor Tower, Villa 12...",
    flat: "Flat / floor (optional)",
    flatPlaceholder: "1204, 12th floor",
    details: "Street & directions (optional)",
    detailsPlaceholder: "Street name, gate colour, entrance...",
    remember: "Remember my details on this device for next time",
    usingSaved: "Using details saved on this device.",
    savedPin: "Using your saved location pin.",
    forget: "Forget them"
  },
  ar: {
    building: "المبنى أو الفيلا",
    buildingPlaceholder: "برج النور، فيلا 12...",
    flat: "الشقة / الطابق (اختياري)",
    flatPlaceholder: "1204، الطابق 12",
    details: "الشارع والاتجاهات (اختياري)",
    detailsPlaceholder: "اسم الشارع، لون البوابة، المدخل...",
    remember: "تذكر بياناتي على هذا الجهاز للمرة القادمة",
    usingSaved: "نستخدم البيانات المحفوظة على هذا الجهاز.",
    savedPin: "نستخدم موقعك المحفوظ.",
    forget: "احذفها"
  }
} as const;

type InstructionKey = "callOnArrival" | "dontRingBell" | "leaveAtDoor" | "noCutlery";

type PendingWhatsAppOrder = {
  onboardingTest: boolean;
  orderId: string;
  webPushPublicKey: string | null;
  whatsappUrl: string;
};

export function CheckoutForm({
  attributionSource = null,
  initialTableNumber = "",
  onboardingTest = false,
  prefill = null,
  restaurant
}: {
  /** Validated ?src= token from the store link, stored on the order. */
  attributionSource?: string | null;
  initialTableNumber?: string;
  onboardingTest?: boolean;
  prefill?: CustomerProfile | null;
  restaurant: PublicRestaurant;
}) {
  const router = useRouter();
  const cart = useCart();
  const { language, setLanguage } = useCustomerLanguage();
  const t = customerTranslations[language];
  const direction = getTextDirection(language);
  // Same saved choice the customer made on the menu.
  const {
    available: availableFulfilmentTypes,
    fulfilmentType,
    setFulfilmentType
  } = useFulfilmentPreference(restaurant, initialTableNumber);
  const [selectedInstructions, setSelectedInstructions] = useState<InstructionKey[]>([]);
  const [noteText, setNoteText] = useState("");
  // Contact and address fields are controlled so details remembered on this
  // device can fill them after mount. A signed-in profile seeds them first.
  const [details, setDetails] = useState<SavedCustomerDetails>(() => ({
    name: prefill?.name ?? "",
    phone: prefill?.phone ?? "",
    area: prefill?.delivery_area ?? "",
    building: "",
    flat: "",
    details: prefill?.delivery_address ?? prefill?.default_address_text ?? "",
    landmark: prefill?.default_landmark ?? "",
    latitude: null,
    longitude: null
  }));
  const [rememberDetails, setRememberDetails] = useState(true);
  const [hasSavedDetails, setHasSavedDetails] = useState(false);
  const detailsStorageKey = savedDetailsStorageKey(restaurant.slug);
  const [isPending, startTransition] = useTransition();
  const [submissionToken] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const [error, setError] = useState<string | null>(null);
  const [fallbackWhatsappUrl, setFallbackWhatsappUrl] = useState<string | null>(null);
  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [pendingWhatsAppOrder, setPendingWhatsAppOrder] = useState<PendingWhatsAppOrder | null>(null);
  const appliedDeliveryFee = fulfilmentType === "delivery" ? restaurant.delivery_fee : 0;
  const total = cart.subtotal + appliedDeliveryFee;
  const amountRemaining = minimumOrderRemaining(
    cart.subtotal,
    restaurant.minimum_order_amount
  );
  const restaurantName = language === "ar" && restaurant.name_ar ? restaurant.name_ar : restaurant.name;
  const scheduleOpen = isRestaurantOpen(
    restaurant.opening_hours_enabled,
    restaurant.opening_hours,
    new Date(),
    restaurant.time_zone
  );
  // Optional delivery-radius gate (client-side UX; the server re-checks). When
  // the restaurant has no radius set, `enforced` is false and nothing changes.
  const deliveryRange = evaluateDeliveryRange(
    restaurant,
    location ? { latitude: location.latitude, longitude: location.longitude } : null
  );
  const deliveryBlocked =
    fulfilmentType === "delivery" &&
    deliveryRange.enforced &&
    !deliveryRange.withinRange;
  const deliveryRadiusKm = restaurant.delivery_radius_km ?? 0;
  const addressCopy = ADDRESS_COPY[language];
  const composedAddress = composeDeliveryAddress(details, language);

  useEffect(() => {
    let saved: SavedCustomerDetails | null = null;

    try {
      saved = parseSavedDetails(window.localStorage.getItem(detailsStorageKey));
    } catch {
      // Storage blocked: the form simply starts empty.
    }

    if (!saved) {
      return;
    }

    const restored = saved;
    setHasSavedDetails(true);
    // Fill only what the signed-in profile left blank.
    setDetails((current) => ({
      name: current.name || restored.name,
      phone: current.phone || restored.phone,
      area: current.area || restored.area,
      building: current.building || restored.building,
      flat: current.flat || restored.flat,
      details: current.details || restored.details,
      landmark: current.landmark || restored.landmark,
      latitude: restored.latitude,
      longitude: restored.longitude
    }));

    if (restored.latitude !== null && restored.longitude !== null) {
      const { latitude, longitude } = restored;
      setLocationMessage(ADDRESS_COPY[language].savedPin);
      setLocation((current) =>
        current ?? {
          latitude,
          longitude,
          mapsUrl: `https://www.google.com/maps?q=${latitude},${longitude}`
        }
      );
    }
    // Language only picks the one-off message; restoring must run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailsStorageKey]);

  // Funnel: one view per visit, plus why a visit could not order.
  const orderingClosed = restaurant.accepting_orders === false || !scheduleOpen;
  const blockReason =
    !cart.isReady || cart.lines.length === 0 || pendingWhatsAppOrder
      ? null
      : amountRemaining > 0
        ? "minimum_order"
        : orderingClosed
          ? "closed"
          : deliveryBlocked && deliveryRange.distanceKm !== null
            ? "out_of_range"
            : null;
  const readyForView = cart.isReady && cart.lines.length > 0 && !pendingWhatsAppOrder;

  useEffect(() => {
    if (readyForView) {
      trackFunnel(restaurant.id, "checkout_view", { fulfilmentType });
    }
    // Once per visit; the fulfilment at first view is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyForView, restaurant.id]);

  useEffect(() => {
    if (blockReason) {
      trackFunnel(restaurant.id, "checkout_blocked", { detail: blockReason, fulfilmentType });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockReason, restaurant.id]);

  function updateDetail(field: keyof typeof ADDRESS_LIMITS, value: string) {
    setDetails((current) => ({ ...current, [field]: value }));
  }

  function persistDetails() {
    try {
      if (!rememberDetails) {
        window.localStorage.removeItem(detailsStorageKey);
        return;
      }

      const toSave: SavedCustomerDetails = {
        ...details,
        latitude: location?.latitude ?? details.latitude,
        longitude: location?.longitude ?? details.longitude
      };
      window.localStorage.setItem(detailsStorageKey, JSON.stringify(toSave));
    } catch {
      // Remembering is a convenience; the order itself is already saved.
    }
  }

  function forgetDetails() {
    try {
      window.localStorage.removeItem(detailsStorageKey);
    } catch {
      // Nothing stored or storage blocked.
    }

    setHasSavedDetails(false);
    setRememberDetails(false);
    setLocation(null);
    setLocationMessage(null);
    setDetails({
      name: "",
      phone: "",
      area: "",
      building: "",
      flat: "",
      details: "",
      landmark: "",
      latitude: null,
      longitude: null
    });
  }
  // One-tap instructions, written into the order notes in the customer's
  // language next to any free-text note.
  const instructionOptions: InstructionKey[] =
    fulfilmentType === "delivery"
      ? ["callOnArrival", "dontRingBell", "leaveAtDoor", "noCutlery"]
      : fulfilmentType === "car_pickup"
        ? ["callOnArrival", "noCutlery"]
        : fulfilmentType === "takeaway"
          ? ["noCutlery"]
          : [];
  const combinedNotes = [
    ...instructionOptions
      .filter((option) => selectedInstructions.includes(option))
      .map((option) => t[option]),
    noteText.trim()
  ]
    .filter(Boolean)
    .join(". ");

  function toggleInstruction(option: InstructionKey) {
    setSelectedInstructions((current) =>
      current.includes(option)
        ? current.filter((entry) => entry !== option)
        : [...current, option]
    );
  }

  function selectFulfilment(type: FulfilmentType) {
    setFulfilmentType(type);
    setLocationError(null);
    setLocationMessage(null);
    // Back to delivery: reuse the remembered pin instead of asking again.
    setLocation(
      type === "delivery" && details.latitude !== null && details.longitude !== null
        ? {
            latitude: details.latitude,
            longitude: details.longitude,
            mapsUrl: `https://www.google.com/maps?q=${details.latitude},${details.longitude}`
          }
        : null
    );
  }

  function captureLocation() {
    setLocationError(null);
    setLocationMessage(null);

    if (!navigator.geolocation) {
      setLocationError(t.locationNotSupported);
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(7));
        const longitude = Number(position.coords.longitude.toFixed(7));
        const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

        setLocation({ latitude, longitude, mapsUrl });
        setLocationMessage(t.locationCaptured);
        setIsLocating(false);
      },
      (geoError) => {
        setIsLocating(false);
        setLocation(null);

        if (geoError.code === geoError.PERMISSION_DENIED) {
          setLocationError(t.locationDenied);
          return;
        }

        setLocationError(t.locationFailed);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFallbackWhatsappUrl(null);

    if (deliveryBlocked) {
      // Guard against a programmatic submit; the server re-checks regardless.
      return;
    }

    const formData = new FormData(event.currentTarget);
    formData.set("items", JSON.stringify(cart.lines));

    startTransition(async () => {
      const result = await createOrderAction(restaurant.slug, formData);

      if (!result.ok) {
        setError(result.error);
        setFallbackWhatsappUrl(result.fallbackWhatsappUrl ?? null);
        return;
      }

      persistDetails();
      trackFunnel(restaurant.id, "order_saved", { orderId: result.orderId, fulfilmentType });

      if (result.confirmationUrl) {
        cart.clearCart();
        const onboardingQuery = result.onboardingTest
          ? "&onboarding=test-order"
          : "";
        router.push(`${result.confirmationUrl}&lang=${language}${onboardingQuery}`);
        return;
      }

      // Without a signing secret, retain the direct-tap handoff in memory.
      // Never replace the current page with an automatic WhatsApp redirect.
      setPendingWhatsAppOrder({
        onboardingTest: result.onboardingTest,
        orderId: result.orderId,
        webPushPublicKey: result.webPushPublicKey,
        whatsappUrl: result.whatsappUrl
      });
    });
  }

  if (!cart.isReady) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10 text-center" dir={direction}>
        <h1 className="text-2xl font-black">{t.loadingCart}</h1>
        <p className="mt-3 text-stone-600">{t.preparingCheckout}</p>
      </main>
    );
  }

  if (pendingWhatsAppOrder) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10 text-center" dir={direction}>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-mint text-leaf">
          <CheckCircle2 size={34} />
        </div>
        <h1 className="mt-6 text-3xl font-black">
          {language === "ar" ? "تم حفظ الطلب" : "Order saved"}
        </h1>
        <p className="mt-3 leading-7 text-stone-600">
          {language === "ar"
            ? "اضغط الزر أدناه لإرسال الطلب إلى المطعم عبر واتساب."
            : "One final step: tap below to send this order to the restaurant on WhatsApp."}
        </p>
        <p className="mt-4 rounded-lg bg-stone-100 px-4 py-3 text-sm font-bold text-stone-700">
          {t.reference}: {pendingWhatsAppOrder.orderId}
        </p>
        {pendingWhatsAppOrder.onboardingTest ? (
          <aside className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4 text-left text-violet-950">
            <p className="font-black">Test order saved · Final step</p>
            <p className="mt-1 text-sm text-violet-900/75">
              Return to Orders and accept the highlighted test order to finish setup.
            </p>
            <Link
              className="focus-ring mt-3 inline-flex w-full items-center justify-center rounded-full bg-violet-700 px-5 py-3 font-black text-white"
              href={onboardingOrdersHref(pendingWhatsAppOrder.orderId)}
            >
              Go to dashboard and accept order
            </Link>
          </aside>
        ) : null}
        <a
          className="focus-ring mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-leaf px-5 py-4 font-black text-white"
          href={pendingWhatsAppOrder.whatsappUrl}
          onClick={() => {
            trackFunnel(restaurant.id, "whatsapp_opened", { orderId: pendingWhatsAppOrder.orderId });
            cart.clearCart();
          }}
          rel={pendingWhatsAppOrder.onboardingTest ? "noopener noreferrer" : undefined}
          target={pendingWhatsAppOrder.onboardingTest ? "_blank" : undefined}
        >
          <MessageCircle size={20} />
          {language === "ar" ? "إرسال عبر واتساب" : "Open WhatsApp to send"}
        </a>
        <InstallAppPrompt language={language} />
        {pendingWhatsAppOrder.webPushPublicKey ? (
          <OrderPushPrompt
            orderId={pendingWhatsAppOrder.orderId}
            publicKey={pendingWhatsAppOrder.webPushPublicKey}
            restaurantSlug={restaurant.slug}
          />
        ) : null}
        <Link
          className="focus-ring mt-3 inline-flex justify-center rounded-full border border-stone-200 bg-white px-5 py-3 font-bold text-ink"
          href={`/r/${restaurant.slug}`}
        >
          {t.backToMenu}
        </Link>
      </main>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10 text-center" dir={direction}>
        <h1 className="text-2xl font-black">{t.cartEmpty}</h1>
        <p className="mt-3 text-stone-600">{t.cartEmptyHint}</p>
        <Link
          className="focus-ring mt-6 inline-flex justify-center rounded-full bg-leaf px-5 py-3 font-bold text-white"
          href={`/r/${restaurant.slug}`}
        >
          {t.backToMenu}
        </Link>
      </main>
    );
  }

  if (amountRemaining > 0) {
    return (
      <main
        className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10 text-center"
        dir={direction}
      >
        <ShoppingBag className="mx-auto text-leaf" size={38} />
        <h1 className="mt-5 text-2xl font-black">
          {language === "ar" ? "لم تصل إلى الحد الأدنى للطلب" : "Minimum order not reached"}
        </h1>
        <p className="mt-3 text-stone-600">
          {language === "ar"
            ? `أضف ${formatCurrency(amountRemaining, restaurant)} أخرى للمتابعة. الحد الأدنى هو ${formatCurrency(
                restaurant.minimum_order_amount,
                restaurant
              )}.`
            : `Add ${formatCurrency(amountRemaining, restaurant)} more to continue. The minimum order is ${formatCurrency(
                restaurant.minimum_order_amount,
                restaurant
              )}.`}
        </p>
        <Link
          className="focus-ring mt-6 inline-flex justify-center rounded-full bg-leaf px-5 py-3 font-bold text-white"
          href={`/r/${restaurant.slug}`}
        >
          {t.backToMenu}
        </Link>
      </main>
    );
  }

  if (restaurant.accepting_orders === false || !scheduleOpen) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10 text-center" dir={direction}>
        <h1 className="text-2xl font-black">
          {language === "ar" ? "الطلبات متوقفة مؤقتاً" : "Ordering is temporarily paused"}
        </h1>
        <p className="mt-3 text-stone-600">
          {language === "ar"
            ? "يمكنك مشاهدة القائمة، لكن المطعم لا يستقبل طلبات جديدة حالياً."
            : restaurant.accepting_orders === false
              ? "You can still view the menu, but the restaurant is not accepting new orders right now."
              : "The restaurant is currently closed. Please return during opening hours."}
        </p>
        <Link
          className="focus-ring mt-6 inline-flex justify-center rounded-full bg-leaf px-5 py-3 font-bold text-white"
          href={`/r/${restaurant.slug}`}
        >
          {t.backToMenu}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:px-8" dir={direction}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href={`/r/${restaurant.slug}`}
          className="focus-ring inline-flex items-center gap-2 rounded-full px-2 py-2 text-sm font-bold text-stone-700"
        >
          <ArrowLeft className={language === "ar" ? "rotate-180" : ""} size={17} />
          {t.menu}
        </Link>
        <LanguageToggle language={language} setLanguage={setLanguage} />
      </div>
      <h1 className="text-2xl font-black sm:text-3xl">{t.checkout}</h1>
      <p className="mt-1 text-sm font-semibold text-stone-500">{restaurantName}</p>
      {onboardingTest ? (
        <aside className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
          <p className="font-black">Test order · Step 2 of 3</p>
          <p className="mt-1 text-violet-900/75">
            Complete checkout with your own details. Then return to the dashboard tab and accept this order.
          </p>
        </aside>
      ) : null}
      {prefill ? (
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-mint/20 px-3 py-1.5 text-sm font-bold text-leaf">
          <CheckCircle2 size={15} />
          {language === "ar"
            ? `مرحباً بعودتك${prefill.name ? `، ${prefill.name}` : ""}! تم ملء بياناتك مسبقاً.`
            : `Welcome back${prefill.name ? `, ${prefill.name}` : ""}! We've filled in your details.`}
        </p>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
        {/* First in the DOM so phones review the order before the form. */}
        <aside className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm lg:sticky lg:top-5 lg:col-start-2 lg:row-start-1">
          <h2 className="text-lg font-black">{t.orderSummary}</h2>
          <div className="mt-3 divide-y divide-stone-100">
            {cart.lines.map((line) => {
              const lineKey = cartLineKey(line);
              const optionsText = formatLineOptions(line.options, language);
              const lineName = language === "ar" && line.name_ar ? line.name_ar : line.name;

              return (
                <div className="flex items-center justify-between gap-3 py-2.5 text-sm" key={lineKey}>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{lineName}</p>
                    {optionsText ? (
                      <p className="text-xs text-stone-500">{optionsText}</p>
                    ) : null}
                    <p className="mt-0.5 font-black text-stone-700">
                      {formatCurrency(line.price * line.quantity, restaurant)}
                    </p>
                  </div>
                  <div className="inline-flex shrink-0 items-center overflow-hidden rounded-full border border-stone-200 bg-stone-50">
                    <button
                      aria-label={`${t.remove} ${lineName}`}
                      className="focus-ring grid h-10 w-10 place-items-center text-stone-700"
                      onClick={() => cart.decrement(lineKey)}
                      type="button"
                    >
                      <Minus size={15} />
                    </button>
                    <span className="w-6 text-center text-sm font-black">{line.quantity}</span>
                    <button
                      aria-label={`${t.addMore} ${lineName}`}
                      className="focus-ring grid h-10 w-10 place-items-center text-stone-700"
                      onClick={() => cart.increment(lineKey)}
                      type="button"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 space-y-1.5 border-t border-stone-200 pt-3 text-sm">
            <div className="flex justify-between">
              <span>{t.subtotal}</span>
              <strong>{formatCurrency(cart.subtotal, restaurant)}</strong>
            </div>
            {fulfilmentType === "delivery" ? (
              <div className="flex justify-between">
                <span>{t.deliveryFee}</span>
                <strong>
                  {appliedDeliveryFee > 0
                    ? formatCurrency(appliedDeliveryFee, restaurant)
                    : t.freeDelivery}
                </strong>
              </div>
            ) : null}
            <div className="flex justify-between text-lg">
              <span className="font-black">{t.total}</span>
              <strong>{formatCurrency(total, restaurant)}</strong>
            </div>
            <p className="flex items-start gap-1.5 pt-1 text-xs font-semibold text-leaf">
              <BadgeCheck className="mt-px shrink-0" size={14} />
              {t.noServiceFee}
            </p>
          </div>
        </aside>

        <form className="space-y-4 lg:col-start-1 lg:row-start-1" onSubmit={onSubmit}>
          {onboardingTest ? <input name="onboarding_test" type="hidden" value="true" /> : null}
          <input name="order_language" readOnly type="hidden" value={language} />
          {attributionSource ? (
            <input name="attribution_source" readOnly type="hidden" value={attributionSource} />
          ) : null}
          <input name="submission_token" readOnly type="hidden" value={submissionToken} />
          <input name="fulfilment_type" readOnly type="hidden" value={fulfilmentType} />
          <input name="items" type="hidden" />
          <input name="notes" readOnly type="hidden" value={combinedNotes} />
          <input name="delivery_latitude" readOnly type="hidden" value={location?.latitude ?? ""} />
          <input name="delivery_longitude" readOnly type="hidden" value={location?.longitude ?? ""} />
          <input name="delivery_google_maps_url" readOnly type="hidden" value={location?.mapsUrl ?? ""} />
          <input name="delivery_place_id" readOnly type="hidden" value="" />

          {availableFulfilmentTypes.length > 1 ? (
            <fieldset>
              <legend className="mb-2 text-sm font-bold">{t.howToReceive}</legend>
              <FulfilmentSelector
                available={availableFulfilmentTypes}
                language={language}
                onChange={selectFulfilment}
                value={fulfilmentType}
              />
            </fieldset>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold">{t.name}</span>
              <input
                autoComplete="name"
                className="focus-ring mt-1 w-full rounded-xl border border-stone-200 bg-white px-4 py-3"
                maxLength={ADDRESS_LIMITS.name}
                name="customer_name"
                onChange={(event) => updateDetail("name", event.target.value)}
                value={details.name}
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold">{t.phoneNumber}</span>
              <input
                autoComplete="tel"
                className="focus-ring mt-1 w-full rounded-xl border border-stone-200 bg-white px-4 py-3"
                inputMode="tel"
                maxLength={ADDRESS_LIMITS.phone}
                name="customer_phone"
                onChange={(event) => updateDetail("phone", event.target.value)}
                required
                type="tel"
                value={details.phone}
              />
            </label>
          </div>

          {fulfilmentType === "delivery" ? (
            <section className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="inline-flex items-center gap-2 font-black">
                  <MapPin className="text-leaf" size={18} />
                  {t.deliveryLocation}
                </h2>
                <button
                  className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-leaf px-4 py-2 text-sm font-black text-leaf disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLocating}
                  onClick={captureLocation}
                  type="button"
                >
                  {isLocating ? <Loader2 className="animate-spin" size={16} /> : <LocateFixed size={16} />}
                  {isLocating ? "..." : t.useCurrentLocation}
                </button>
              </div>
              {!location && !locationError && !deliveryRange.enforced ? (
                <p className="mt-2 text-xs text-stone-500">{t.currentLocationHelp}</p>
              ) : null}

              {locationMessage ? (
                <p className="mt-3 flex flex-wrap items-center gap-x-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                  {locationMessage}
                  {location ? (
                    <a
                      className="font-black text-leaf underline-offset-4 hover:underline"
                      href={location.mapsUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {t.viewSelectedLocation}
                    </a>
                  ) : null}
                </p>
              ) : null}
              {locationError ? (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                  {locationError}
                </p>
              ) : null}

              {deliveryRange.enforced && deliveryRange.distanceKm === null ? (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                  {language === "ar"
                    ? `يرجى مشاركة موقعك الحالي للتأكد من أنك ضمن منطقة توصيل ${restaurantName} (${deliveryRadiusKm} كم).`
                    : `Please share your current location to confirm you're within ${restaurantName}'s delivery area (${deliveryRadiusKm} km).`}
                </p>
              ) : null}
              {deliveryRange.enforced && deliveryBlocked && deliveryRange.distanceKm !== null ? (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  {language === "ar"
                    ? `عذراً — أنت خارج منطقة توصيل ${restaurantName} (${deliveryRadiusKm} كم). تبعد حوالي ${deliveryRange.distanceKm.toFixed(
                        1
                      )} كم. لا يزال بإمكانك الطلب للاستلام أو لتناول الطعام في المطعم.`
                    : `Sorry — you're outside ${restaurantName}'s delivery area (${deliveryRadiusKm} km). You're about ${deliveryRange.distanceKm.toFixed(
                        1
                      )} km away. You can still order for pickup or dine-in.`}
                </p>
              ) : null}

              <div className="mt-4 space-y-4">
                <input name="delivery_address" readOnly type="hidden" value={composedAddress} />
                <label className="block">
                  <span className="text-sm font-bold">{t.deliveryArea}</span>
                  <input
                    autoComplete="address-level2"
                    className="focus-ring mt-1 w-full rounded-xl border border-stone-200 bg-white px-4 py-3"
                    maxLength={ADDRESS_LIMITS.area}
                    name="delivery_area"
                    onChange={(event) => updateDetail("area", event.target.value)}
                    placeholder={t.deliveryAreaPlaceholder}
                    required
                    value={details.area}
                  />
                </label>
                <div className="grid grid-cols-[1fr_8.5rem] items-end gap-3">
                  <label className="block min-w-0">
                    <span className="text-sm font-bold">{addressCopy.building}</span>
                    <input
                      autoComplete="address-line1"
                      className="focus-ring mt-1 w-full rounded-xl border border-stone-200 bg-white px-4 py-3"
                      maxLength={ADDRESS_LIMITS.building}
                      onChange={(event) => updateDetail("building", event.target.value)}
                      placeholder={addressCopy.buildingPlaceholder}
                      // Older saved addresses live in the details field only.
                      required={!details.details.trim()}
                      value={details.building}
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className="text-sm font-bold">{addressCopy.flat}</span>
                    <input
                      autoComplete="address-line2"
                      className="focus-ring mt-1 w-full rounded-xl border border-stone-200 bg-white px-4 py-3"
                      maxLength={ADDRESS_LIMITS.flat}
                      onChange={(event) => updateDetail("flat", event.target.value)}
                      placeholder={addressCopy.flatPlaceholder}
                      value={details.flat}
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-sm font-bold">{addressCopy.details}</span>
                  <input
                    className="focus-ring mt-1 w-full rounded-xl border border-stone-200 bg-white px-4 py-3"
                    maxLength={ADDRESS_LIMITS.details}
                    onChange={(event) => updateDetail("details", event.target.value)}
                    placeholder={addressCopy.detailsPlaceholder}
                    value={details.details}
                  />
                </label>
                {/* Closed <details> content stays in the form and submits. */}
                <details className="group" open={Boolean(details.landmark) || undefined}>
                  <summary className="focus-ring inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full text-sm font-black text-leaf">
                    <Plus className="transition group-open:rotate-45" size={15} />
                    {t.addLandmark}
                  </summary>
                  <input
                    aria-label={t.landmark}
                    className="focus-ring mt-2 w-full rounded-xl border border-stone-200 bg-white px-4 py-3"
                    maxLength={ADDRESS_LIMITS.landmark}
                    name="delivery_landmark"
                    onChange={(event) => updateDetail("landmark", event.target.value)}
                    placeholder={t.landmarkPlaceholder}
                    value={details.landmark}
                  />
                </details>
              </div>
            </section>
          ) : fulfilmentType === "takeaway" ? (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-start gap-3">
                <ShoppingBag className="mt-0.5 shrink-0 text-leaf" size={20} />
                <div>
                  <h2 className="font-black">{t.takeaway}</h2>
                  <p className="mt-1 text-sm text-stone-600">{t.takeawayHelp}</p>
                  <p className="mt-2 text-sm font-bold text-stone-800">
                    {restaurant.address || restaurant.name}
                  </p>
                </div>
              </div>
            </section>
          ) : fulfilmentType === "car_pickup" ? (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-start gap-3">
                <CarFront className="mt-0.5 shrink-0 text-leaf" size={20} />
                <div>
                  <h2 className="font-black">{t.carPickup}</h2>
                  <p className="mt-1 text-sm text-stone-600">{t.carPickupHelp}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-bold">{t.carPlateNumber}</span>
                  <input
                    autoCapitalize="characters"
                    className="focus-ring mt-1 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 uppercase"
                    maxLength={40}
                    name="car_plate_number"
                    placeholder={t.carPlatePlaceholder}
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-bold">{t.carDescription}</span>
                  <input
                    className="focus-ring mt-1 w-full rounded-xl border border-stone-200 bg-white px-4 py-3"
                    maxLength={120}
                    name="car_description"
                    placeholder={t.carDescriptionPlaceholder}
                  />
                </label>
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-start gap-3">
                <Utensils className="mt-0.5 shrink-0 text-leaf" size={20} />
                <div>
                  <h2 className="font-black">{t.dineIn}</h2>
                  <p className="mt-1 text-sm text-stone-600">{t.dineInHelp}</p>
                </div>
              </div>
              <label className="mt-4 block">
                <span className="text-sm font-bold">{t.tableNumber}</span>
                <input
                  className="focus-ring mt-1 w-full rounded-xl border border-stone-200 bg-white px-4 py-3"
                  defaultValue={initialTableNumber}
                  maxLength={40}
                  name="table_number"
                  placeholder={t.tableNumberPlaceholder}
                  required
                />
              </label>
            </section>
          )}

          <div>
            {instructionOptions.length > 0 ? (
              <>
                <p className="text-sm font-bold">{t.instructions}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {instructionOptions.map((option) => {
                    const selected = selectedInstructions.includes(option);

                    return (
                      <button
                        aria-pressed={selected}
                        className={`focus-ring min-h-10 rounded-full border px-3.5 py-2 text-sm font-bold transition ${
                          selected
                            ? "border-leaf bg-mint text-leaf"
                            : "border-stone-200 bg-white text-stone-600"
                        }`}
                        key={option}
                        onClick={() => toggleInstruction(option)}
                        type="button"
                      >
                        {t[option]}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
            <details className="group mt-3">
              <summary className="focus-ring inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full text-sm font-black text-leaf">
                <Plus className="transition group-open:rotate-45" size={15} />
                {t.addNote}
              </summary>
              <textarea
                aria-label={t.notes}
                className="focus-ring mt-2 min-h-20 w-full rounded-xl border border-stone-200 bg-white px-4 py-3"
                maxLength={600}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder={t.notesPlaceholder}
                value={noteText}
              />
            </details>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-bold">{t.paymentMethod}</legend>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  value: "Cash on Delivery",
                  label: fulfilmentType === "delivery" ? t.cashOnDelivery : t.cashOnCollection
                },
                {
                  value: "Card on Delivery",
                  label: fulfilmentType === "delivery" ? t.cardOnDelivery : t.cardOnCollection
                },
                ...(restaurant.country_code === "IN"
                  ? [{ value: "UPI", label: "UPI" }]
                  : [])
              ].map((method) => (
                <label
                  className="flex min-h-12 items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold has-[:checked]:border-leaf has-[:checked]:bg-mint/40"
                  key={method.value}
                >
                  <input defaultChecked={method.value === "Cash on Delivery"} name="payment_method" type="radio" value={method.value} />
                  {method.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-3 text-sm leading-6 text-stone-700">
            <label className="flex gap-3">
              <input
                checked={rememberDetails}
                className="mt-1 h-4 w-4 shrink-0"
                onChange={(event) => setRememberDetails(event.target.checked)}
                type="checkbox"
              />
              <span>
                {addressCopy.remember}
                {hasSavedDetails ? (
                  <>
                    {" "}
                    <span className="text-stone-500">{addressCopy.usingSaved}</span>{" "}
                    <button
                      className="focus-ring rounded font-black text-leaf underline"
                      onClick={forgetDetails}
                      type="button"
                    >
                      {addressCopy.forget}
                    </button>
                  </>
                ) : null}
              </span>
            </label>
            <label className="flex gap-3">
              <input className="mt-1 h-4 w-4 shrink-0" name="consent_order_processing" required type="checkbox" />
              <span>{t.consentOrder}</span>
            </label>
            <label className="flex gap-3">
              <input className="mt-1 h-4 w-4 shrink-0" name="consent_marketing" type="checkbox" />
              <span>
                {t.consentMarketing}{" "}
                <Link className="font-black text-leaf underline" href="/privacy" target="_blank">
                  {language === "ar" ? "سياسة الخصوصية" : "Privacy notice"}
                </Link>
              </span>
            </label>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              <p>{error}</p>
              {fallbackWhatsappUrl ? (
                <a
                  className="focus-ring mt-3 inline-flex items-center gap-2 rounded-full bg-leaf px-4 py-2 font-black text-white"
                  href={fallbackWhatsappUrl}
                >
                  <MessageCircle size={17} />
                  {t.sendDirectlyOnWhatsApp}
                </a>
              ) : null}
            </div>
          ) : null}

          <div className="sticky bottom-0 z-10 -mx-4 border-t border-stone-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span className="font-bold text-stone-600">{t.total}</span>
              <strong className="text-base font-black">{formatCurrency(total, restaurant)}</strong>
            </div>
            <button
              className="focus-ring inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-leaf px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPending || amountRemaining > 0 || deliveryBlocked}
              type="submit"
            >
              <MessageCircle className="shrink-0" size={18} />
              {isPending ? t.sendingOrder : t.saveAndContinueWhatsApp}
            </button>
            <p className="mt-2 text-center text-xs text-stone-500">{t.whatsAppNextStep}</p>
          </div>
        </form>
      </div>
    </main>
  );
}

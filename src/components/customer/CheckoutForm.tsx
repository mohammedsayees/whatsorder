"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  CarFront,
  CheckCircle2,
  CreditCard,
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
import { saveCustomerAddressAction } from "@/app/r/[restaurantSlug]/account/actions";
import { cartLineKey, formatLineOptions } from "@/lib/cart-line";
import {
  ADDRESS_LIMITS,
  checkoutPreferencesStorageKey,
  composeDeliveryAddress,
  liftLegacyAddress,
  parseCheckoutPreferences,
  parseSavedDetails,
  savedDetailsStorageKey,
  type SavedCustomerDetails
} from "@/lib/customer-address";
import { formatCurrency } from "@/lib/currency";
import { trackFunnel } from "@/lib/customer-funnel-client";
import { groupCheckoutKey, type GroupCheckoutHandoff } from "@/lib/group-order";
import { pickSuggestion, type CheckoutSuggestions } from "@/lib/checkout-suggestion";
import { isRestaurantOpen, nextOpening, reopeningMessage } from "@/lib/opening-hours";
import { minimumOrderRemaining } from "@/lib/security";
import { onboardingOrdersHref } from "@/lib/onboarding-order-handoff";
import { customerTranslations, getTextDirection } from "@/lib/customer-i18n";
import { evaluateDeliveryRange } from "@/lib/geo";
import { useCart } from "@/components/customer/CartProvider";
import { FulfilmentSelector } from "@/components/customer/FulfilmentSelector";
import { PromoCodeField } from "@/components/customer/PromoCodeField";
import { SavedAddressPicker, SaveAddressToggle } from "@/components/customer/SavedAddressPicker";
import {
  isSameAddress,
  MAX_SAVED_ADDRESSES,
  type SavedAddress
} from "@/lib/customer-addresses";
import type { CustomerVoucher } from "@/lib/customer-vouchers";
import { computePromoDiscount, type PromoTerms } from "@/lib/promo-codes";
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

function savedPinLocation(
  address: Pick<SavedAddress, "latitude" | "longitude">
): CapturedLocation | null {
  if (address.latitude === null || address.longitude === null) {
    return null;
  }
  return {
    latitude: address.latitude,
    longitude: address.longitude,
    mapsUrl: `https://www.google.com/maps?q=${address.latitude},${address.longitude}`
  };
}

// Checkout-only copy, kept out of customer-i18n so the menu bundle stays small.
const ADDRESS_COPY = {
  en: {
    building: "Building or villa",
    buildingPlaceholder: "Al Noor Tower",
    flat: "Flat (optional)",
    flatPlaceholder: "1204",
    details: "Street & directions (optional)",
    detailsPlaceholder: "Street name, gate colour, entrance...",
    remember: "Remember my details on this device for next time",
    usingSaved: "Using details saved on this device.",
    savedPin: "Using your saved location pin.",
    homeLabel: "Home",
    addressLabel: "Address",
    forget: "Forget them"
  },
  ar: {
    building: "المبنى أو الفيلا",
    buildingPlaceholder: "برج النور",
    flat: "الشقة (اختياري)",
    flatPlaceholder: "1204",
    details: "الشارع والاتجاهات (اختياري)",
    detailsPlaceholder: "اسم الشارع، لون البوابة، المدخل...",
    remember: "تذكر بياناتي على هذا الجهاز للمرة القادمة",
    usingSaved: "نستخدم البيانات المحفوظة على هذا الجهاز.",
    savedPin: "نستخدم موقعك المحفوظ.",
    homeLabel: "المنزل",
    addressLabel: "عنوان",
    forget: "احذفها"
  }
} as const;

const onlinePaymentCopy = {
  en: {
    label: "Pay online now (card, Apple Pay, Google Pay)",
    redirecting: "Opening secure payment…",
    pay: "Pay",
    payNextStep: "We save your order, then open secure card payment."
  },
  ar: {
    label: "ادفع الآن إلكترونياً (بطاقة، Apple Pay، Google Pay)",
    redirecting: "جارٍ فتح صفحة الدفع الآمنة…",
    pay: "ادفع",
    payNextStep: "نحفظ طلبك ثم نفتح صفحة الدفع الآمنة بالبطاقة."
  }
} as const;

// More checkout-only copy (kept out of the shared menu bundle).
const CHECKOUT_COPY = {
  en: {
    placeOrder: "Place order",
    phoneHint: "Order updates come to this WhatsApp number.",
    closedTitle: "We're closed right now",
    pausedTitle: "Ordering is temporarily paused",
    closedBody: "You can still browse the menu, and your cart is saved.",
    pausedBody: "You can still view the menu, but the restaurant is not accepting new orders right now."
  },
  ar: {
    placeOrder: "تأكيد الطلب",
    phoneHint: "تصلك تحديثات الطلب على رقم واتساب هذا.",
    closedTitle: "المطعم مغلق الآن",
    pausedTitle: "الطلبات متوقفة مؤقتاً",
    closedBody: "يمكنك تصفح القائمة، وسلتك محفوظة.",
    pausedBody: "يمكنك مشاهدة القائمة، لكن المطعم لا يستقبل طلبات جديدة حالياً."
  }
} as const;

/** Example local number per country, as the phone field's placeholder. */
const PHONE_PLACEHOLDERS: Record<string, string> = {
  AE: "05X XXX XXXX",
  IN: "98765 43210"
};

type InstructionKey = "callOnArrival" | "dontRingBell" | "leaveAtDoor" | "noCutlery";

type PendingWhatsAppOrder = {
  onboardingTest: boolean;
  orderId: string;
  webPushPublicKey: string | null;
  whatsappUrl: string;
};

export function CheckoutForm({
  attributionSource = null,
  initialPromoCode = null,
  initialTableNumber = "",
  onboardingTest = false,
  onlinePaymentAvailable = false,
  prefill = null,
  restaurant,
  savedAddresses = [],
  signedIn = false,
  suggestions = null,
  vouchers = []
}: {
  /** Validated ?src= token from the store link, stored on the order. */
  attributionSource?: string | null;
  /** Validated ?promo= from a voucher link; applied once the cart loads. */
  initialPromoCode?: string | null;
  initialTableNumber?: string;
  onboardingTest?: boolean;
  /** The restaurant's Stripe account can take card payments now. */
  onlinePaymentAvailable?: boolean;
  prefill?: CustomerProfile | null;
  restaurant: PublicRestaurant;
  /** Signed-in customer's address book at this café (default first). */
  savedAddresses?: SavedAddress[];
  /** A customer session exists for this café (enables "save address"). */
  signedIn?: boolean;
  /** "Goes well with your order" data; null hides the suggestion. */
  suggestions?: CheckoutSuggestions | null;
  /** Signed-in customer's usable vouchers at this café. */
  vouchers?: CustomerVoucher[];
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
  // One suggestion per visit: once added or dismissed it does not come back
  // with a new item (no chain of interruptions).
  const [suggestionDone, setSuggestionDone] = useState(false);
  // Set when the organiser arrives from a locked office group order.
  const [groupHandoff, setGroupHandoff] = useState<GroupCheckoutHandoff | null>(null);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(groupCheckoutKey(restaurant.slug));
      const handoff = raw ? (JSON.parse(raw) as GroupCheckoutHandoff) : null;

      if (handoff?.token && typeof handoff.notes === "string") {
        setGroupHandoff(handoff);
        setNoteText((current) => current || handoff.notes);
      }
    } catch {
      // No group handoff.
    }
  }, [restaurant.slug]);
  // Contact and address fields are controlled so details remembered on this
  // device can fill them after mount. A signed-in profile seeds them first;
  // a saved account address (default first) beats the profile's last address.
  const accountAddress =
    savedAddresses.find((address) => address.is_default) ?? savedAddresses[0] ?? null;
  const [details, setDetails] = useState<SavedCustomerDetails>(() =>
    accountAddress
      ? {
          name: prefill?.name ?? "",
          phone: prefill?.phone ?? "",
          area: accountAddress.area,
          building: accountAddress.building,
          flat: accountAddress.flat,
          details: accountAddress.details,
          landmark: accountAddress.landmark,
          latitude: accountAddress.latitude,
          longitude: accountAddress.longitude
        }
      : liftLegacyAddress({
          name: prefill?.name ?? "",
          phone: prefill?.phone ?? "",
          area: prefill?.delivery_area ?? "",
          building: "",
          flat: "",
          details: prefill?.delivery_address ?? prefill?.default_address_text ?? "",
          landmark: prefill?.default_landmark ?? "",
          latitude: null,
          longitude: null
        })
  );
  // A customer who already ordered here (signed-in profile, or details this
  // device remembered from a past order) has given order-processing consent;
  // start it ticked. They can still untick it, and the server still requires it.
  const [consentOrder, setConsentOrder] = useState(Boolean(prefill));
  // Start from the customer's current marketing choice: the order saves this
  // box onto their record, so an unticked default would silently opt them out.
  const [consentMarketing, setConsentMarketing] = useState(Boolean(prefill?.consent_marketing));
  const [paymentMethod, setPaymentMethod] = useState("Cash on Delivery");
  const [saveAddressToAccount, setSaveAddressToAccount] = useState(true);
  const [newAddressLabel, setNewAddressLabel] = useState("");
  const [rememberDetails, setRememberDetails] = useState(true);
  const [hasSavedDetails, setHasSavedDetails] = useState(false);
  const detailsStorageKey = savedDetailsStorageKey(restaurant.slug);
  const [isPending, startTransition] = useTransition();
  const [redirectingToPayment, setRedirectingToPayment] = useState(false);
  const [submissionToken] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const [error, setError] = useState<string | null>(null);
  const [fallbackWhatsappUrl, setFallbackWhatsappUrl] = useState<string | null>(null);
  const [location, setLocation] = useState<CapturedLocation | null>(() =>
    accountAddress ? savedPinLocation(accountAddress) : null
  );
  const [locationMessage, setLocationMessage] = useState<string | null>(() =>
    accountAddress && accountAddress.latitude !== null ? ADDRESS_COPY.en.savedPin : null
  );
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [pendingWhatsAppOrder, setPendingWhatsAppOrder] = useState<PendingWhatsAppOrder | null>(null);
  const appliedDeliveryFee = fulfilmentType === "delivery" ? restaurant.delivery_fee : 0;
  // Preview only: the server re-checks the code and recomputes the amount.
  const [appliedPromo, setAppliedPromo] = useState<PromoTerms | null>(null);
  const promoAmount = appliedPromo ? computePromoDiscount(appliedPromo, cart.subtotal) : 0;
  const total = Math.round((cart.subtotal - promoAmount + appliedDeliveryFee) * 100) / 100;
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
  const suggestion = suggestionDone
    ? null
    : pickSuggestion(cart.lines, cart.subtotal, suggestions);
  const addressCopy = ADDRESS_COPY[language];
  const composedAddress = composeDeliveryAddress(details, language);

  const hasAccountAddress = accountAddress !== null;
  // The highlighted saved address is whichever one the fields still match.
  const selectedAddressId =
    savedAddresses.find((address) => isSameAddress(address, details))?.id ?? null;
  const showSaveAddress =
    signedIn &&
    fulfilmentType === "delivery" &&
    selectedAddressId === null &&
    savedAddresses.length < MAX_SAVED_ADDRESSES &&
    Boolean(details.area.trim() || details.building.trim() || details.details.trim());

  function applySavedAddress(address: SavedAddress) {
    setDetails((current) => ({
      ...current,
      area: address.area,
      building: address.building,
      flat: address.flat,
      details: address.details,
      landmark: address.landmark,
      latitude: address.latitude,
      longitude: address.longitude
    }));
    const pin = savedPinLocation(address);
    setLocation(pin);
    setLocationError(null);
    setLocationMessage(pin ? addressCopy.savedPin : null);
  }

  function startNewAddress() {
    setDetails((current) => ({
      ...current,
      area: "",
      building: "",
      flat: "",
      details: "",
      landmark: "",
      latitude: null,
      longitude: null
    }));
    setLocation(null);
    setLocationError(null);
    setLocationMessage(null);
  }

  // Best-effort after the order is saved: never blocks or fails the order.
  async function saveAddressAfterOrder() {
    if (!showSaveAddress || !saveAddressToAccount) {
      return;
    }
    const label =
      newAddressLabel.trim() ||
      (savedAddresses.length === 0
        ? addressCopy.homeLabel
        : `${addressCopy.addressLabel} ${savedAddresses.length + 1}`);
    try {
      await Promise.race([
        saveCustomerAddressAction(
          restaurant.slug,
          null,
          {
            label,
            area: details.area,
            building: details.building,
            flat: details.flat,
            details: details.details,
            landmark: details.landmark,
            latitude: location?.latitude ?? null,
            longitude: location?.longitude ?? null
          },
          false
        ),
        new Promise((resolve) => window.setTimeout(resolve, 2500))
      ]);
    } catch {
      // Saving the address is a convenience; the order is already placed.
    }
  }

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

    const restored = liftLegacyAddress(saved);
    setHasSavedDetails(true);
    setConsentOrder(true);
    // Fill only what the signed-in profile left blank. A saved account
    // address owns the address fields; the device copy only adds contact info.
    setDetails((current) =>
      hasAccountAddress
        ? {
            ...current,
            name: current.name || restored.name,
            phone: current.phone || restored.phone
          }
        : {
            name: current.name || restored.name,
            phone: current.phone || restored.phone,
            area: current.area || restored.area,
            building: current.building || restored.building,
            flat: current.flat || restored.flat,
            details: current.details || restored.details,
            landmark: current.landmark || restored.landmark,
            latitude: restored.latitude,
            longitude: restored.longitude
          }
    );

    if (!hasAccountAddress && restored.latitude !== null && restored.longitude !== null) {
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

  const paymentMethods = [
    {
      value: "Cash on Delivery",
      label: fulfilmentType === "delivery" ? t.cashOnDelivery : t.cashOnCollection
    },
    {
      value: "Card on Delivery",
      label: fulfilmentType === "delivery" ? t.cardOnDelivery : t.cardOnCollection
    },
    ...(restaurant.country_code === "IN" ? [{ value: "UPI", label: "UPI" }] : []),
    ...(onlinePaymentAvailable
      ? [{ value: "Online Payment", label: onlinePaymentCopy[language === "ar" ? "ar" : "en"].label }]
      : [])
  ];
  const payingOnline = paymentMethod === "Online Payment";
  const checkoutCopy = CHECKOUT_COPY[language === "ar" ? "ar" : "en"];
  const prefsStorageKey = checkoutPreferencesStorageKey(restaurant.slug);

  useEffect(() => {
    try {
      const prefs = parseCheckoutPreferences(
        window.localStorage.getItem(prefsStorageKey),
        paymentMethods.map((method) => method.value)
      );
      if (prefs.paymentMethod) setPaymentMethod(prefs.paymentMethod);
      // A signed-in profile is the source of truth; the device copy covers guests.
      if (!prefill && prefs.consentMarketing !== null) setConsentMarketing(prefs.consentMarketing);
    } catch {
      // Storage blocked: defaults stand.
    }
    // Read once on mount; the method list only matters for validation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsStorageKey]);

  function persistPreferences() {
    try {
      window.localStorage.setItem(
        prefsStorageKey,
        JSON.stringify({
          paymentMethod,
          // Guests' marketing choice is remembered only with their details.
          consentMarketing: !signedIn && rememberDetails ? consentMarketing : null
        })
      );
    } catch {
      // A convenience only.
    }
  }

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
    // Signed-in customers' details live in their account, not on the device.
    if (signedIn) {
      return;
    }
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
      persistPreferences();
      await saveAddressAfterOrder();

      if (groupHandoff?.organiserToken) {
        // Lets colleagues see "placed"; best-effort, never blocks the order.
        void fetch(`/api/group-orders/${encodeURIComponent(groupHandoff.token)}/complete`, {
          body: JSON.stringify({ organiserToken: groupHandoff.organiserToken, orderId: result.orderId }),
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          keepalive: true,
          method: "POST"
        }).catch(() => undefined);
      }

      try {
        window.sessionStorage.removeItem(groupCheckoutKey(restaurant.slug));
      } catch {
        // Nothing to clear.
      }

      trackFunnel(restaurant.id, "order_saved", { orderId: result.orderId, fulfilmentType });

      if (result.paymentUrl) {
        // Stripe Checkout on the restaurant's account; it returns the
        // customer to the order page (which also offers "Pay now" again).
        cart.clearCart();
        setRedirectingToPayment(true);
        window.location.assign(result.paymentUrl);
        return;
      }

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
    const paused = restaurant.accepting_orders === false;
    const reopening = paused
      ? null
      : nextOpening(restaurant.opening_hours_enabled, restaurant.opening_hours, new Date(), restaurant.time_zone);
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10 text-center" dir={direction}>
        <h1 className="text-2xl font-black">
          {paused ? checkoutCopy.pausedTitle : checkoutCopy.closedTitle}
        </h1>
        {reopening ? (
          <p className="mt-3 font-black text-ink">
            {reopeningMessage(reopening, language === "ar" ? "ar" : "en")}
          </p>
        ) : null}
        <p className="mt-2 text-stone-600">
          {paused ? checkoutCopy.pausedBody : checkoutCopy.closedBody}
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
      {groupHandoff ? (
        <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          {language === "ar"
            ? `طلب جماعي لـ ${groupHandoff.people} أشخاص. أضفنا ما طلبه كل شخص إلى ملاحظات الطلب للمطبخ. ستدفع عن المجموعة كاملة.`
            : `Group order for ${groupHandoff.people} ${groupHandoff.people === 1 ? "person" : "people"}. Each person's items are in the order notes for the kitchen. You're paying for the whole group.`}
        </p>
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
          {suggestion ? (
            <div className="mt-2 flex items-center gap-3 rounded-xl border border-dashed border-leaf/40 bg-mint/30 p-2.5">
              {suggestion.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  height={48}
                  loading="lazy"
                  src={suggestion.image_url}
                  width={48}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase tracking-wide text-leaf">
                  {language === "ar" ? "يناسب طلبك" : "Goes well with your order"}
                </p>
                <p className="truncate text-sm font-bold">
                  {language === "ar" && suggestion.name_ar ? suggestion.name_ar : suggestion.name}
                  <span className="ms-1.5 font-black text-stone-700">
                    {formatCurrency(suggestion.price, restaurant)}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <button
                  className="focus-ring inline-flex min-h-9 items-center gap-1 rounded-full bg-leaf px-3 py-1.5 text-sm font-black text-white"
                  onClick={() => {
                    cart.addItem({
                      ...suggestion,
                      description: null,
                      description_ar: null,
                      is_available: true,
                      is_featured: false
                    });
                    setSuggestionDone(true);
                  }}
                  type="button"
                >
                  <Plus size={14} />
                  {language === "ar" ? "إضافة" : "Add"}
                </button>
                <button
                  className="focus-ring rounded px-1 text-[11px] font-semibold text-stone-500"
                  onClick={() => setSuggestionDone(true)}
                  type="button"
                >
                  {language === "ar" ? "لا شكراً" : "No thanks"}
                </button>
              </div>
            </div>
          ) : null}
          <div className="mt-3 border-t border-stone-200 pt-3">
            <PromoCodeField
              applied={appliedPromo}
              initialCode={initialPromoCode}
              language={language}
              lines={cart.lines}
              onChange={setAppliedPromo}
              restaurant={restaurant}
              subtotal={cart.subtotal}
              vouchers={vouchers}
            />
          </div>
          <div className="mt-3 space-y-1.5 border-t border-stone-200 pt-3 text-sm">
            <div className="flex justify-between">
              <span>{t.subtotal}</span>
              <strong>{formatCurrency(cart.subtotal, restaurant)}</strong>
            </div>
            {appliedPromo && promoAmount > 0 ? (
              <div className="flex justify-between text-leaf">
                <span>{language === "ar" ? `خصم (${appliedPromo.code})` : `Promo ${appliedPromo.code}`}</span>
                <strong>−{formatCurrency(promoAmount, restaurant)}</strong>
              </div>
            ) : null}
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
          {/* Sent only while the code actually discounts this cart. */}
          <input name="promo_code" readOnly type="hidden" value={appliedPromo && promoAmount > 0 ? appliedPromo.code : ""} />
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
                placeholder={PHONE_PLACEHOLDERS[restaurant.country_code ?? "AE"]}
                required
                type="tel"
                value={details.phone}
              />
              <span className="mt-1 block text-xs text-stone-500">{checkoutCopy.phoneHint}</span>
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

              <SavedAddressPicker
                addresses={savedAddresses}
                language={language}
                onNew={startNewAddress}
                onSelect={applySavedAddress}
                selectedId={selectedAddressId}
              />

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
                <div className="grid grid-cols-[1fr_8.5rem] items-start gap-3">
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
                {showSaveAddress ? (
                  <SaveAddressToggle
                    checked={saveAddressToAccount}
                    label={newAddressLabel}
                    language={language}
                    onCheckedChange={setSaveAddressToAccount}
                    onLabelChange={setNewAddressLabel}
                  />
                ) : null}
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
            <details className="group mt-3" open={Boolean(groupHandoff) || undefined}>
              <summary className="focus-ring inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full text-sm font-black text-leaf">
                <Plus className="transition group-open:rotate-45" size={15} />
                {t.addNote}
              </summary>
              <textarea
                aria-label={t.notes}
                className="focus-ring mt-2 min-h-20 w-full rounded-xl border border-stone-200 bg-white px-4 py-3"
                maxLength={950}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder={t.notesPlaceholder}
                value={noteText}
              />
            </details>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-bold">{t.paymentMethod}</legend>
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map((method) => (
                <label
                  className={`flex min-h-12 items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold has-[:checked]:border-leaf has-[:checked]:bg-mint/40${
                    method.value === "Online Payment" ? " col-span-2" : ""
                  }`}
                  key={method.value}
                >
                  <input
                    checked={paymentMethod === method.value}
                    name="payment_method"
                    onChange={() => setPaymentMethod(method.value)}
                    type="radio"
                    value={method.value}
                  />
                  {method.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-3 text-sm leading-6 text-stone-700">
            {signedIn ? null : (
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
            )}
            <label className="flex gap-3">
              <input
                checked={consentOrder}
                className="mt-1 h-4 w-4 shrink-0"
                name="consent_order_processing"
                onChange={(event) => setConsentOrder(event.target.checked)}
                required
                type="checkbox"
              />
              <span>{t.consentOrder}</span>
            </label>
            <label className="flex gap-3">
              <input
                checked={consentMarketing}
                className="mt-1 h-4 w-4 shrink-0"
                name="consent_marketing"
                onChange={(event) => setConsentMarketing(event.target.checked)}
                type="checkbox"
              />
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
              disabled={isPending || redirectingToPayment || amountRemaining > 0 || deliveryBlocked}
              type="submit"
            >
              {payingOnline ? (
                <CreditCard className="shrink-0" size={18} />
              ) : (
                <MessageCircle className="shrink-0" size={18} />
              )}
              {redirectingToPayment
                ? onlinePaymentCopy[language === "ar" ? "ar" : "en"].redirecting
                : isPending
                  ? t.sendingOrder
                  : payingOnline
                    ? `${onlinePaymentCopy[language === "ar" ? "ar" : "en"].pay} ${formatCurrency(total, restaurant)}`
                    : checkoutCopy.placeOrder}
            </button>
            <p className="mt-2 text-center text-xs text-stone-500">
              {payingOnline ? onlinePaymentCopy[language === "ar" ? "ar" : "en"].payNextStep : t.whatsAppNextStep}
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}

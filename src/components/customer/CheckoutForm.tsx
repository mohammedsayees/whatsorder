"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, MapPin, MessageCircle, Send } from "lucide-react";
import { createOrderAction, lookupSavedCustomerAction } from "@/app/actions";
import { formatAED } from "@/lib/currency";
import { customerTranslations, getTextDirection } from "@/lib/customer-i18n";
import { useCart } from "@/components/customer/CartProvider";
import { LanguageToggle } from "@/components/customer/LanguageToggle";
import { useCustomerLanguage } from "@/components/customer/useCustomerLanguage";
import type { Restaurant } from "@/lib/types";

type CapturedLocation = {
  latitude: number;
  longitude: number;
  mapsUrl: string;
};

type SavedCustomer = {
  name: string;
  phone: string;
  deliveryArea: string;
  deliveryAddress: string;
  deliveryLandmark: string;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string;
  addressText: string;
  marketingOptIn: boolean;
};

type PendingWhatsAppOrder = {
  orderId: string;
  whatsappUrl: string;
};

function isMobileWhatsAppHandoff() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function CheckoutForm({ restaurant }: { restaurant: Restaurant }) {
  const router = useRouter();
  const cart = useCart();
  const { language, setLanguage } = useCustomerLanguage();
  const t = customerTranslations[language];
  const direction = getTextDirection(language);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLTextAreaElement>(null);
  const landmarkRef = useRef<HTMLInputElement>(null);
  const marketingRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [addressText, setAddressText] = useState("");
  const [savedCustomer, setSavedCustomer] = useState<SavedCustomer | null>(null);
  const [savedCustomerMessage, setSavedCustomerMessage] = useState<string | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLookingUpCustomer, setIsLookingUpCustomer] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [pendingWhatsAppOrder, setPendingWhatsAppOrder] = useState<PendingWhatsAppOrder | null>(null);
  const total = useMemo(() => cart.subtotal + restaurant.delivery_fee, [cart.subtotal, restaurant.delivery_fee]);
  const restaurantName = language === "ar" && restaurant.name_ar ? restaurant.name_ar : restaurant.name;

  async function lookupSavedCustomer(phone: string) {
    const cleanPhone = phone.trim();

    setSavedCustomer(null);
    setSavedCustomerMessage(null);

    if (cleanPhone.length < 6) {
      return;
    }

    setIsLookingUpCustomer(true);
    const result = await lookupSavedCustomerAction(restaurant.slug, cleanPhone);
    setIsLookingUpCustomer(false);

    if (!result.ok) {
      setSavedCustomerMessage(result.error);
      return;
    }

    if (result.found) {
      setSavedCustomer(result.customer);
      setSavedCustomerMessage(t.savedDetailsFound);
      return;
    }

    setSavedCustomerMessage(null);
  }

  function applySavedCustomer() {
    if (!savedCustomer) {
      return;
    }

    if (nameRef.current) {
      nameRef.current.value = savedCustomer.name;
    }
    if (phoneRef.current) {
      phoneRef.current.value = savedCustomer.phone;
    }
    if (areaRef.current) {
      areaRef.current.value = savedCustomer.deliveryArea;
    }
    if (addressRef.current) {
      addressRef.current.value = savedCustomer.deliveryAddress;
    }
    if (landmarkRef.current) {
      landmarkRef.current.value = savedCustomer.deliveryLandmark;
    }
    if (marketingRef.current) {
      marketingRef.current.checked = savedCustomer.marketingOptIn;
    }

    setAddressText(savedCustomer.addressText);

    if (savedCustomer.latitude !== null && savedCustomer.longitude !== null && savedCustomer.googleMapsUrl) {
      setLocation({
        latitude: savedCustomer.latitude,
        longitude: savedCustomer.longitude,
        mapsUrl: savedCustomer.googleMapsUrl
      });
      setLocationMessage(t.savedLocationApplied);
    }

    setSavedCustomerMessage(t.savedAddressApplied);
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

    const formData = new FormData(event.currentTarget);
    formData.set("items", JSON.stringify(cart.lines));

    startTransition(async () => {
      const result = await createOrderAction(restaurant.slug, formData);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (isMobileWhatsAppHandoff()) {
        // iOS Safari and WhatsApp in-app browsers handle a direct customer tap more reliably
        // than an automatic redirect after the async Supabase save.
        setPendingWhatsAppOrder({
          orderId: result.orderId,
          whatsappUrl: result.whatsappUrl
        });
        return;
      }

      cart.clearCart();
      const whatsappWindow = window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");

      if (!whatsappWindow) {
        window.location.assign(result.whatsappUrl);
        return;
      }

      router.push(`/r/${restaurant.slug}/thank-you?order=${encodeURIComponent(result.orderId)}`);
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
          Reference: {pendingWhatsAppOrder.orderId}
        </p>
        <a
          className="focus-ring mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-leaf px-5 py-4 font-black text-white"
          href={pendingWhatsAppOrder.whatsappUrl}
          onClick={() => cart.clearCart()}
        >
          <MessageCircle size={20} />
          {language === "ar" ? "إرسال عبر واتساب" : "Open WhatsApp to send"}
        </a>
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

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8" dir={direction}>
      <section>
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link
            href={`/r/${restaurant.slug}`}
            className="focus-ring inline-flex items-center gap-2 rounded-full px-2 py-2 text-sm font-bold text-stone-700"
          >
            <ArrowLeft className={language === "ar" ? "rotate-180" : ""} size={17} />
            {t.menu}
          </Link>
          <LanguageToggle language={language} setLanguage={setLanguage} />
        </div>
        <h1 className="text-3xl font-black">{t.checkout}</h1>
        <p className="mt-2 text-stone-600">
          {language === "ar" ? `أرسل طلبا واضحا إلى ${restaurantName} عبر واتساب.` : `Send a clear order to ${restaurantName} on WhatsApp.`}
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <input name="order_language" readOnly type="hidden" value={language} />
          <input name="items" type="hidden" />
          <input name="delivery_latitude" readOnly type="hidden" value={location?.latitude ?? ""} />
          <input name="delivery_longitude" readOnly type="hidden" value={location?.longitude ?? ""} />
          <input name="delivery_google_maps_url" readOnly type="hidden" value={location?.mapsUrl ?? ""} />
          <input name="delivery_place_id" readOnly type="hidden" value="" />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold">{t.name}</span>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-4 py-3"
                name="customer_name"
                ref={nameRef}
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold">{t.phoneNumber}</span>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-4 py-3"
                inputMode="tel"
                name="customer_phone"
                onBlur={(event) => {
                  void lookupSavedCustomer(event.currentTarget.value);
                }}
                ref={phoneRef}
                required
              />
            </label>
          </div>
          {isLookingUpCustomer ? (
            <p className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-stone-600">
              {t.checkingSavedDetails}
            </p>
          ) : null}
          {savedCustomerMessage ? (
            <div className="rounded-lg border border-mint/70 bg-mint/10 px-4 py-3 text-sm text-stone-700">
              <p className="font-bold">{savedCustomerMessage}</p>
              {savedCustomer ? (
                <button
                  className="focus-ring mt-3 rounded-full bg-leaf px-4 py-2 text-sm font-black text-white"
                  onClick={applySavedCustomer}
                  type="button"
                >
                  {t.useSavedAddress}
                </button>
              ) : null}
            </div>
          ) : null}
          <section className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <span className="mt-1 rounded-full bg-mint/20 p-2 text-leaf">
                <MapPin size={18} />
              </span>
              <div>
                <h2 className="font-black">{t.deliveryLocation}</h2>
                <p className="mt-1 text-sm text-stone-600">
                  {t.currentLocationHelp}
                </p>
              </div>
            </div>

            <button
              className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-leaf px-4 py-3 text-sm font-black text-leaf disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              disabled={isLocating}
              onClick={captureLocation}
              type="button"
            >
              {isLocating ? <Loader2 className="animate-spin" size={17} /> : <MapPin size={17} />}
              {isLocating ? "..." : t.useCurrentLocation}
            </button>

            {locationMessage ? (
              <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                {locationMessage}
              </p>
            ) : null}
            {location ? (
              <a
                className="mt-2 inline-flex text-sm font-black text-leaf underline-offset-4 hover:underline"
                href={location.mapsUrl}
                rel="noreferrer"
                target="_blank"
              >
                {t.viewSelectedLocation}
              </a>
            ) : null}
            {locationError ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                {locationError}
              </p>
            ) : null}

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-bold">{t.deliveryArea}</span>
                <input
                  className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-4 py-3"
                  name="delivery_area"
                  placeholder={t.deliveryAreaPlaceholder}
                  ref={areaRef}
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold">{t.address}</span>
                <textarea
                  className="focus-ring mt-1 min-h-24 w-full rounded-lg border border-stone-200 bg-white px-4 py-3"
                  name="delivery_address"
                  placeholder={t.addressPlaceholder}
                  ref={addressRef}
                  required
                />
              </label>
              <input name="delivery_address_text" readOnly type="hidden" value={addressText} />
              <label className="block">
                <span className="text-sm font-bold">{t.landmark}</span>
                <input
                  className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-4 py-3"
                  name="delivery_landmark"
                  placeholder={t.landmarkPlaceholder}
                  ref={landmarkRef}
                />
              </label>
            </div>
          </section>
          <label className="block">
            <span className="text-sm font-bold">{t.notes}</span>
            <textarea
              className="focus-ring mt-1 min-h-20 w-full rounded-lg border border-stone-200 bg-white px-4 py-3"
              name="notes"
              placeholder={t.notesPlaceholder}
            />
          </label>
          <fieldset className="rounded-lg border border-stone-200 bg-white p-4">
            <legend className="px-1 text-sm font-bold">{t.paymentMethod}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {[
                { value: "Cash on Delivery", label: t.cashOnDelivery },
                { value: "Card on Delivery", label: t.cardOnDelivery }
              ].map((method) => (
                <label
                  className="flex items-center gap-3 rounded-lg border border-stone-200 px-3 py-3 text-sm font-semibold"
                  key={method.value}
                >
                  <input defaultChecked={method.value === "Cash on Delivery"} name="payment_method" type="radio" value={method.value} />
                  {method.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex gap-3 rounded-lg border border-stone-200 bg-white p-4 text-sm leading-6">
            <input className="mt-1" name="consent_order_processing" required type="checkbox" />
            <span>
              {t.consentOrder}
            </span>
          </label>
          <label className="flex gap-3 rounded-lg border border-stone-200 bg-white p-4 text-sm leading-6">
            <input className="mt-1" name="consent_marketing" ref={marketingRef} type="checkbox" />
            <span>{t.consentMarketing}</span>
          </label>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}

          <button
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-full bg-leaf px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            <Send size={18} />
            {isPending ? t.sendingOrder : t.sendOrder}
          </button>
        </form>
      </section>

      <aside className="h-fit rounded-lg border border-stone-200 bg-white p-4 shadow-sm lg:sticky lg:top-5">
        <h2 className="text-lg font-black">{t.orderSummary}</h2>
        <div className="mt-4 space-y-3">
          {cart.lines.map((line) => (
            <div className="flex items-start justify-between gap-3 text-sm" key={line.item_id}>
              <div>
                <p className="font-bold">{language === "ar" && line.name_ar ? line.name_ar : line.name}</p>
                <p className="text-stone-500">{t.quantityShort} {line.quantity}</p>
              </div>
              <p className="font-bold">{formatAED(line.price * line.quantity)}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 space-y-2 border-t border-stone-200 pt-4 text-sm">
          <div className="flex justify-between">
            <span>{t.subtotal}</span>
            <strong>{formatAED(cart.subtotal)}</strong>
          </div>
          <div className="flex justify-between">
            <span>{t.delivery}</span>
            <strong>{formatAED(restaurant.delivery_fee)}</strong>
          </div>
          <div className="flex justify-between text-lg">
            <span className="font-black">{t.total}</span>
            <strong>{formatAED(total)}</strong>
          </div>
        </div>
      </aside>
    </main>
  );
}

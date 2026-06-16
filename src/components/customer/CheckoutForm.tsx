"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, MapPin, Send } from "lucide-react";
import { createOrderAction, lookupSavedCustomerAction } from "@/app/actions";
import { formatAED } from "@/lib/currency";
import { useCart } from "@/components/customer/CartProvider";
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

export function CheckoutForm({ restaurant }: { restaurant: Restaurant }) {
  const router = useRouter();
  const cart = useCart();
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
  const total = useMemo(() => cart.subtotal + restaurant.delivery_fee, [cart.subtotal, restaurant.delivery_fee]);

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
      setSavedCustomerMessage("We found your saved details. Use saved address?");
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
      setLocationMessage("Saved location applied");
    }

    setSavedCustomerMessage("Saved address applied. You can edit it before placing the order.");
  }

  function captureLocation() {
    setLocationError(null);
    setLocationMessage(null);

    if (!navigator.geolocation) {
      setLocationError("Location is not supported on this browser. Please enter your full address manually.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(7));
        const longitude = Number(position.coords.longitude.toFixed(7));
        const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

        setLocation({ latitude, longitude, mapsUrl });
        setLocationMessage("Location captured successfully");
        setIsLocating(false);
      },
      (geoError) => {
        setIsLocating(false);
        setLocation(null);

        if (geoError.code === geoError.PERMISSION_DENIED) {
          setLocationError("Location permission denied. Please enter your full address manually.");
          return;
        }

        setLocationError("Could not capture your location. Please enter your full address manually.");
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

      cart.clearCart();
      window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
      router.push(`/r/${restaurant.slug}/thank-you?order=${encodeURIComponent(result.orderId)}`);
    });
  }

  if (!cart.isReady) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10 text-center">
        <h1 className="text-2xl font-black">Loading your cart</h1>
        <p className="mt-3 text-stone-600">Preparing checkout details...</p>
      </main>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10 text-center">
        <h1 className="text-2xl font-black">Your cart is empty</h1>
        <p className="mt-3 text-stone-600">Add a few items from the menu before checkout.</p>
        <Link
          className="focus-ring mt-6 inline-flex justify-center rounded-full bg-leaf px-5 py-3 font-bold text-white"
          href={`/r/${restaurant.slug}`}
        >
          Back to menu
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
      <section>
        <Link
          href={`/r/${restaurant.slug}`}
          className="focus-ring mb-5 inline-flex items-center gap-2 rounded-full px-2 py-2 text-sm font-bold text-stone-700"
        >
          <ArrowLeft size={17} />
          Menu
        </Link>
        <h1 className="text-3xl font-black">Checkout</h1>
        <p className="mt-2 text-stone-600">Send a clear order to {restaurant.name} on WhatsApp.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <input name="items" type="hidden" />
          <input name="delivery_latitude" readOnly type="hidden" value={location?.latitude ?? ""} />
          <input name="delivery_longitude" readOnly type="hidden" value={location?.longitude ?? ""} />
          <input name="delivery_google_maps_url" readOnly type="hidden" value={location?.mapsUrl ?? ""} />
          <input name="delivery_place_id" readOnly type="hidden" value="" />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold">Name</span>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-4 py-3"
                name="customer_name"
                ref={nameRef}
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold">Phone number</span>
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
              Checking saved details...
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
                  Use saved address
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
                <h2 className="font-black">Delivery location</h2>
                <p className="mt-1 text-sm text-stone-600">
                  Current location is optional but helps the restaurant deliver more accurately.
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
              {isLocating ? "Capturing location..." : "Use my current location"}
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
                View selected location
              </a>
            ) : null}
            {locationError ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                {locationError}
              </p>
            ) : null}

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-bold">Delivery area</span>
                <input
                  className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-4 py-3"
                  name="delivery_area"
                  placeholder="Al Nahda, Deira, Business Bay..."
                  ref={areaRef}
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold">Full address / building / flat / villa number</span>
                <textarea
                  className="focus-ring mt-1 min-h-24 w-full rounded-lg border border-stone-200 bg-white px-4 py-3"
                  name="delivery_address"
                  ref={addressRef}
                  required
                />
              </label>
              <input name="delivery_address_text" readOnly type="hidden" value={addressText} />
              <label className="block">
                <span className="text-sm font-bold">Landmark</span>
                <input
                  className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-4 py-3"
                  name="delivery_landmark"
                  placeholder="Near mosque, opposite supermarket..."
                  ref={landmarkRef}
                />
              </label>
            </div>
          </section>
          <label className="block">
            <span className="text-sm font-bold">Notes</span>
            <textarea
              className="focus-ring mt-1 min-h-20 w-full rounded-lg border border-stone-200 bg-white px-4 py-3"
              name="notes"
              placeholder="No onions, extra spicy, call on arrival..."
            />
          </label>
          <fieldset className="rounded-lg border border-stone-200 bg-white p-4">
            <legend className="px-1 text-sm font-bold">Payment method</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {["Cash on Delivery", "Card on Delivery"].map((method) => (
                <label
                  className="flex items-center gap-3 rounded-lg border border-stone-200 px-3 py-3 text-sm font-semibold"
                  key={method}
                >
                  <input defaultChecked={method === "Cash on Delivery"} name="payment_method" type="radio" value={method} />
                  {method}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex gap-3 rounded-lg border border-stone-200 bg-white p-4 text-sm leading-6">
            <input className="mt-1" name="consent_order_processing" required type="checkbox" />
            <span>
              I agree that this restaurant can save my details to process my order and make future
              ordering easier.
            </span>
          </label>
          <label className="flex gap-3 rounded-lg border border-stone-200 bg-white p-4 text-sm leading-6">
            <input className="mt-1" name="consent_marketing" ref={marketingRef} type="checkbox" />
            <span>I agree to receive offers and updates from this restaurant on WhatsApp.</span>
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
            {isPending ? "Saving order..." : "Send Order on WhatsApp"}
          </button>
        </form>
      </section>

      <aside className="h-fit rounded-lg border border-stone-200 bg-white p-4 shadow-sm lg:sticky lg:top-5">
        <h2 className="text-lg font-black">Order summary</h2>
        <div className="mt-4 space-y-3">
          {cart.lines.map((line) => (
            <div className="flex items-start justify-between gap-3 text-sm" key={line.item_id}>
              <div>
                <p className="font-bold">{line.name}</p>
                <p className="text-stone-500">Qty {line.quantity}</p>
              </div>
              <p className="font-bold">{formatAED(line.price * line.quantity)}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 space-y-2 border-t border-stone-200 pt-4 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <strong>{formatAED(cart.subtotal)}</strong>
          </div>
          <div className="flex justify-between">
            <span>Delivery</span>
            <strong>{formatAED(restaurant.delivery_fee)}</strong>
          </div>
          <div className="flex justify-between text-lg">
            <span className="font-black">Total</span>
            <strong>{formatAED(total)}</strong>
          </div>
        </div>
      </aside>
    </main>
  );
}

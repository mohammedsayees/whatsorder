"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadRestaurantBrandImageAction } from "@/app/actions";

type BrandImageKind = "logo" | "cover";

export function BrandImageUploader({
  canWrite,
  currentUrl,
  kind,
  restaurantId
}: {
  canWrite: boolean;
  currentUrl: string | null | undefined;
  kind: BrandImageKind;
  restaurantId?: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState(currentUrl ?? "");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const isLogo = kind === "logo";
  const label = isLogo ? "Restaurant logo" : "Cover image";
  const guidance = isLogo
    ? "Recommended: 512 × 512 px, JPG/PNG/WebP, up to 2MB."
    : "Recommended: 1600 × 600 px, JPG/PNG/WebP, up to 5MB.";

  function uploadSelectedFile(file: File) {
    const formData = new FormData();
    formData.set("image", file);
    formData.set("kind", kind);
    if (restaurantId) {
      formData.set("restaurant_id", restaurantId);
    }

    setMessage("");
    startTransition(async () => {
      const result = await uploadRestaurantBrandImageAction(formData);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }

      setImageUrl(result.publicUrl);
      setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <div className={isLogo ? "" : "sm:col-span-2"}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold">{label}</span>
        {imageUrl ? (
          <a
            className="text-xs font-bold text-leaf underline-offset-2 hover:underline"
            href={imageUrl}
            rel="noreferrer"
            target="_blank"
          >
            View full image
          </a>
        ) : null}
      </div>

      <div
        className={
          isLogo
            ? "mt-2 flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border border-stone-200 bg-stone-50"
            : "mt-2 flex aspect-[8/3] w-full items-center justify-center overflow-hidden rounded-2xl border border-stone-200 bg-stone-50"
        }
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- restaurant uploads may use external URLs.
          <img
            alt={`${label} preview`}
            className="h-full w-full object-cover"
            src={imageUrl}
          />
        ) : (
          <span className="px-4 text-center text-xs font-semibold text-stone-400">
            No image uploaded
          </span>
        )}
      </div>

      <input
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={!canWrite || isPending}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            uploadSelectedFile(file);
          }
          event.target.value = "";
        }}
        ref={fileInputRef}
        type="file"
      />
      <button
        className="focus-ring mt-3 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canWrite || isPending}
        onClick={() => fileInputRef.current?.click()}
        type="button"
      >
        {isPending ? "Uploading…" : imageUrl ? "Replace from device" : "Upload from device"}
      </button>
      <p className="mt-2 text-xs leading-5 text-stone-500">{guidance}</p>
      {message ? (
        <p
          aria-live="polite"
          className={`mt-2 text-xs font-bold ${
            message.toLowerCase().includes("success") ? "text-leaf" : "text-red-600"
          }`}
        >
          {message}
        </p>
      ) : null}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-bold text-stone-500">
          Advanced: use an image URL
        </summary>
        <input
          className="focus-ring mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm"
          disabled={!canWrite}
          name={isLogo ? "logo_url" : "cover_image_url"}
          onChange={(event) => setImageUrl(event.target.value)}
          placeholder="https://…"
          type="url"
          value={imageUrl}
        />
      </details>
    </div>
  );
}

import { updateStoreSlugAction } from "@/app/admin/settings/actions";

export function StoreLinkForm({
  slug,
  canWrite,
  saved,
  error
}: {
  slug: string;
  canWrite: boolean;
  saved: boolean;
  error: string | null;
}) {
  const isDemoLink = slug.startsWith("demo-");

  return (
    <form
      action={updateStoreSlugAction}
      className="max-w-2xl scroll-mt-24 rounded-lg border border-stone-200 bg-white p-5 shadow-sm"
      id="store-link"
    >
      <h2 className="text-lg font-black">Store link</h2>
      <p className="mt-1 text-sm text-stone-600">
        The address customers open to order, and the link inside your QR codes.
      </p>
      {isDemoLink ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Your store still uses its demo link. Choose a permanent one before you print QR codes.
        </p>
      ) : null}
      <label className="mt-4 block">
        <span className="text-sm font-bold">Link</span>
        <span className="mt-1 flex items-center overflow-hidden rounded-lg border border-stone-200 focus-within:border-leaf">
          <span className="shrink-0 bg-stone-50 px-3 py-2 text-sm text-stone-500">/r/</span>
          <input
            autoCapitalize="none"
            autoCorrect="off"
            className="min-w-0 flex-1 px-3 py-2 outline-none"
            defaultValue={slug}
            disabled={!canWrite}
            maxLength={60}
            name="slug"
            required
            spellCheck={false}
          />
        </span>
        <span className="mt-1 block text-xs font-medium text-stone-500">
          Lowercase letters, numbers and hyphens. Changing it stops the old link and any printed
          QR codes from working.
        </span>
      </label>
      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </p>
      ) : null}
      {saved && !error ? (
        <p className="mt-3 text-sm font-semibold text-emerald-700">Store link saved.</p>
      ) : null}
      <button
        className="focus-ring mt-4 rounded-lg bg-leaf px-5 py-2.5 font-bold text-white disabled:opacity-50"
        disabled={!canWrite}
        type="submit"
      >
        Save store link
      </button>
    </form>
  );
}

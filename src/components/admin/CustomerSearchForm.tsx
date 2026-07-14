import { Search } from "lucide-react";

// Server-rendered GET form — search stays in the URL and runs server-side, so
// large customer lists never get filtered in the browser. Submitting drops the
// page param (back to page 1) while keeping the active segment.
export function CustomerSearchForm({
  segment,
  query
}: {
  segment: string;
  query: string;
}) {
  return (
    <form action="/admin/customers" className="mt-4 flex gap-2" method="get">
      <input name="segment" type="hidden" value={segment} />
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          size={16}
        />
        <input
          aria-label="Search customers by name or phone"
          className="focus-ring w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-sm"
          defaultValue={query}
          name="q"
          placeholder="Search by name or phone number"
          type="search"
        />
      </div>
      <button
        className="focus-ring rounded-lg bg-ink px-4 py-2.5 text-sm font-black text-white"
        type="submit"
      >
        Search
      </button>
      {query ? (
        <a
          className="focus-ring inline-flex items-center rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-black text-stone-600 hover:bg-stone-50"
          href={`/admin/customers?segment=${segment}`}
        >
          Clear
        </a>
      ) : null}
    </form>
  );
}

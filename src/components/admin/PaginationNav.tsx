import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationNavProps = {
  basePath: string;
  page: number;
  pageSize: number;
  query?: Record<string, string | undefined>;
  total: number;
  totalPages: number;
};

function paginationHref(
  basePath: string,
  page: number,
  query: Record<string, string | undefined>
) {
  const search = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value) {
      search.set(key, value);
    }
  });
  search.set("page", String(page));

  return `${basePath}?${search.toString()}`;
}

export function PaginationNav({
  basePath,
  page,
  pageSize,
  query = {},
  total,
  totalPages
}: PaginationNavProps) {
  if (total === 0) {
    return null;
  }

  const firstRecord = (page - 1) * pageSize + 1;
  const lastRecord = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className="mt-5 flex flex-col gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm font-semibold text-stone-500">
        Showing {firstRecord}–{lastRecord} of {total}
      </p>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        {page > 1 ? (
          <Link
            className="focus-ring inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-2 text-sm font-black text-stone-700 hover:bg-stone-50"
            href={paginationHref(basePath, page - 1, query)}
          >
            <ChevronLeft size={16} />
            Previous
          </Link>
        ) : (
          <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-lg border border-stone-100 px-3 py-2 text-sm font-black text-stone-300">
            <ChevronLeft size={16} />
            Previous
          </span>
        )}
        <span className="text-sm font-bold text-stone-600">
          Page {page} of {Math.max(1, totalPages)}
        </span>
        {page < totalPages ? (
          <Link
            className="focus-ring inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-2 text-sm font-black text-stone-700 hover:bg-stone-50"
            href={paginationHref(basePath, page + 1, query)}
          >
            Next
            <ChevronRight size={16} />
          </Link>
        ) : (
          <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-lg border border-stone-100 px-3 py-2 text-sm font-black text-stone-300">
            Next
            <ChevronRight size={16} />
          </span>
        )}
      </div>
    </nav>
  );
}

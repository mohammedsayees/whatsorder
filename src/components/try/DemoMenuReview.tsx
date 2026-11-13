"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Trash2, Undo2 } from "lucide-react";

import {
  saveDemoMenuReviewAction,
  skipDemoMenuReviewAction,
  type DemoReviewData
} from "@/app/try/actions";
import { DEMO_MAX_PRICE, reviewFlagLabels } from "@/lib/demo-store";

type ItemState = {
  name: string;
  price: string;
  deleted: boolean;
};

function priceValue(raw: string): number | null {
  if (raw.trim() === "") {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= DEMO_MAX_PRICE ? value : null;
}

export default function DemoMenuReview({
  review,
  onDone
}: {
  review: DemoReviewData;
  onDone: (itemCount: number) => void;
}) {
  const original = useMemo(
    () => new Map(review.items.map((item) => [item.id, item])),
    [review.items]
  );
  const [items, setItems] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(
      review.items.map((item) => [item.id, { name: item.name, price: String(item.price), deleted: false }])
    )
  );
  const [categoryNames, setCategoryNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(review.categories.map((category) => [category.id, category.name]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flagged = review.items.filter((item) => item.flags.length > 0);
  const activeCount = Object.values(items).filter((item) => !item.deleted).length;

  function update(id: string, patch: Partial<ItemState>) {
    setItems((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  async function save() {
    setError(null);
    const changedItems: { id: string; name: string; price: number }[] = [];
    const deletedItemIds: string[] = [];

    for (const [id, state] of Object.entries(items)) {
      if (state.deleted) {
        deletedItemIds.push(id);
        continue;
      }
      const name = state.name.trim();
      const price = priceValue(state.price);
      if (!name) {
        setError("Every item needs a name. Delete the item instead.");
        return;
      }
      if (price === null) {
        setError(`Check the price for “${name}”.`);
        return;
      }
      const before = original.get(id);
      if (before && (before.name !== name || before.price !== price)) {
        changedItems.push({ id, name, price });
      }
    }

    if (activeCount === 0) {
      setError("Keep at least one item on your menu.");
      return;
    }

    const changedCategories = review.categories
      .map((category) => ({ id: category.id, name: (categoryNames[category.id] ?? "").trim() }))
      .filter((category, index) => category.name !== review.categories[index].name);
    if (changedCategories.some((category) => !category.name)) {
      setError("Every category needs a name.");
      return;
    }

    setSaving(true);
    try {
      const result = await saveDemoMenuReviewAction({
        items: changedItems,
        deletedItemIds,
        categories: changedCategories
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone(activeCount);
    } catch {
      setError("Your changes couldn't be saved. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    setError(null);
    setSaving(true);

    try {
      const result = await skipDemoMenuReviewAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone(review.items.length);
    } catch {
      setError("Your progress couldn't be saved. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  function row(id: string, showFlags: boolean) {
    const state = items[id];
    const item = original.get(id);
    if (!state || !item) {
      return null;
    }
    const priceInvalid = priceValue(state.price) === null;

    return (
      <li key={`${showFlags ? "f" : "c"}-${id}`} className="py-2.5">
        {showFlags ? (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {item.flags.map((flag) => (
              <span
                key={flag}
                className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900"
              >
                {reviewFlagLabels[flag]}
              </span>
            ))}
          </div>
        ) : null}
        <div className={`flex items-center gap-2 ${state.deleted ? "opacity-50" : ""}`}>
          <input
            aria-label="Item name"
            value={state.name}
            disabled={state.deleted}
            maxLength={120}
            onChange={(event) => update(id, { name: event.target.value })}
            className={`min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 ${
              state.deleted ? "line-through" : ""
            }`}
          />
          <label className="flex shrink-0 items-center rounded-lg border border-slate-200 focus-within:border-emerald-500">
            <span className="sr-only">Price for {state.name}</span>
            <input
              value={state.price}
              disabled={state.deleted}
              inputMode="decimal"
              onChange={(event) => update(id, { price: event.target.value })}
              className={`w-16 rounded-lg px-2 py-2 text-right text-sm outline-none ${
                priceInvalid && !state.deleted ? "text-rose-600" : ""
              }`}
            />
            <span className="pr-2 text-xs text-slate-500">{review.currencyCode}</span>
          </label>
          <button
            type="button"
            onClick={() => update(id, { deleted: !state.deleted })}
            aria-label={state.deleted ? `Restore ${state.name}` : `Delete ${state.name}`}
            className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-rose-600"
          >
            {state.deleted ? <Undo2 size={16} /> : <Trash2 size={16} />}
          </button>
        </div>
        {item.sizes && !state.deleted ? (
          <p className="mt-1 pl-1 text-xs text-slate-500">
            Sizes:{" "}
            {item.sizes
              .map((size) =>
                size.priceDelta > 0 ? `${size.name} +${size.priceDelta}` : size.name
              )
              .join(" · ")}
            <span className="text-slate-400"> (price above is the smallest size)</span>
          </p>
        ) : null}
      </li>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-bold text-emerald-950">Check your menu</h2>
      <p className="mt-1 text-sm text-slate-600">
        The AI read {review.items.length} items in {review.categories.length}{" "}
        {review.categories.length === 1 ? "category" : "categories"}. Fix anything it misread
        before customers see it.
      </p>

      {flagged.length > 0 ? (
        <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <h3 className="flex items-center gap-2 font-semibold text-amber-950">
            <AlertTriangle size={16} />
            Check {flagged.length === 1 ? "this item" : `these ${flagged.length} items`} first
          </h3>
          <ul className="mt-1 divide-y divide-amber-200/70">{flagged.map((item) => row(item.id, true))}</ul>
        </section>
      ) : (
        <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Nothing looked off. Give the prices a quick scan anyway.
        </p>
      )}

      <div className="mt-6 space-y-5">
        {review.categories.map((category) => {
          const categoryItems = review.items.filter((item) => item.categoryId === category.id);
          if (categoryItems.length === 0) {
            return null;
          }
          return (
            <section key={category.id}>
              <input
                aria-label="Category name"
                value={categoryNames[category.id] ?? ""}
                maxLength={80}
                onChange={(event) =>
                  setCategoryNames((current) => ({ ...current, [category.id]: event.target.value }))
                }
                className="w-full rounded-lg border border-transparent px-1 py-1 text-base font-bold text-emerald-950 outline-none hover:border-slate-200 focus:border-emerald-500"
              />
              <ul className="divide-y divide-slate-100">{categoryItems.map((item) => row(item.id, false))}</ul>
            </section>
          );
        })}
      </div>

      <div className="sticky bottom-0 -mx-5 mt-6 border-t border-slate-100 bg-white/95 px-5 pb-1 pt-4 backdrop-blur sm:-mx-6 sm:px-6">
        {error ? (
          <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3.5 font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-60"
        >
          {saving ? <Loader2 className="animate-spin" size={18} /> : null}
          Looks good: save {activeCount} items
        </button>
        <button
          type="button"
          onClick={skip}
          disabled={saving}
          className="mt-2 w-full py-2 text-sm font-semibold text-slate-500 hover:text-slate-700"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

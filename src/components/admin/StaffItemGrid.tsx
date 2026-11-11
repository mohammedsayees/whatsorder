"use client";
import { formatCurrency } from "@/lib/currency";
import type { Restaurant } from "@/lib/types";

export function ItemGrid({
  items,
  onAdd,
  restaurant
}: {
  items: { id: string; name: string; hasOptions: boolean; price: number }[];
  onAdd: (id: string) => void;
  restaurant: Restaurant;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
      {items.map((item) => (
        <button
          className="focus-ring flex min-h-24 flex-col justify-between gap-2 rounded-lg border border-stone-200 bg-white p-3 text-left shadow-sm hover:border-leaf hover:bg-mint active:scale-[0.98]"
          key={item.id}
          onClick={() => onAdd(item.id)}
          type="button"
        >
          <span className="break-words text-sm font-bold leading-tight">{item.name}</span>
          <span className="flex items-center gap-2 text-sm font-black text-leaf">
            {formatCurrency(item.price, restaurant)}
            {item.hasOptions ? (
              <span className="rounded-full bg-mint/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-leaf">
                Options
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}

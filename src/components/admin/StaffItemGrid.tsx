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
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((item) => (
        <button
          className="focus-ring flex h-full flex-col justify-between gap-2 rounded-lg border border-stone-200 p-3 text-left hover:border-leaf hover:bg-mint"
          key={item.id}
          onClick={() => onAdd(item.id)}
          type="button"
        >
          <span className="text-sm font-bold leading-tight">{item.name}</span>
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

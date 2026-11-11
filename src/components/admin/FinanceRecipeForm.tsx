"use client";

import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createFinanceRecipeRevisionAction } from "@/app/admin/finance/costing/actions";

type Ingredient = { id: string; name: string; canonical_unit: string };
type RecipeLine = { id: number; ingredientId: string; quantity: string; wastePct: string };

export function FinanceRecipeForm({
  ingredients,
  itemId,
  options
}: {
  ingredients: Ingredient[];
  itemId: string;
  options: Array<{ id: string; name: string }>;
}) {
  const nextId = useRef(1);
  const [targetOptionId, setTargetOptionId] = useState("");
  const [zeroIncrementalCost, setZeroIncrementalCost] = useState(false);
  const [lines, setLines] = useState<RecipeLine[]>([
    { id: 0, ingredientId: "", quantity: "", wastePct: "0" }
  ]);
  const serializedLines = (zeroIncrementalCost ? [] : lines).map(({ ingredientId, quantity, wastePct }) => ({
    ingredientId,
    quantity,
    wastePct
  }));

  function updateLine(id: number, patch: Partial<RecipeLine>) {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  }

  return (
    <form action={createFinanceRecipeRevisionAction} className="space-y-4">
      <input name="menu_item_id" type="hidden" value={itemId} />
      <input name="lines_json" type="hidden" value={JSON.stringify(serializedLines)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Recipe target
          <select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="menu_option_id" onChange={(event) => { setTargetOptionId(event.target.value); if (!event.target.value) setZeroIncrementalCost(false); }} value={targetOptionId}>
            <option value="">Base item</option>
            {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-bold">
          Effective from
          <input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="effective_from" required type="date" />
        </label>
      </div>
      {targetOptionId ? <label className="flex items-center gap-2 text-sm font-bold"><input checked={zeroIncrementalCost} onChange={(event) => setZeroIncrementalCost(event.target.checked)} type="checkbox" /> This option has no incremental ingredient or packaging cost</label> : null}
      <div className={`space-y-3 ${zeroIncrementalCost ? "hidden" : ""}`}>
        {lines.map((line) => (
          <div className="grid gap-2 rounded-lg border border-stone-200 p-3 sm:grid-cols-[1fr_130px_110px_auto]" key={line.id}>
            <label className="text-xs font-bold">
              Ingredient / packaging
              <select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-2 py-2" disabled={zeroIncrementalCost} onChange={(event) => updateLine(line.id, { ingredientId: event.target.value })} required={!zeroIncrementalCost} value={line.ingredientId}>
                <option value="">Choose</option>
                {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.canonical_unit})</option>)}
              </select>
            </label>
            <label className="text-xs font-bold">
              Quantity
              <input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-2 py-2" disabled={zeroIncrementalCost} inputMode="decimal" onChange={(event) => updateLine(line.id, { quantity: event.target.value })} required={!zeroIncrementalCost} value={line.quantity} />
            </label>
            <label className="text-xs font-bold">
              Waste %
              <input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-2 py-2" disabled={zeroIncrementalCost} inputMode="decimal" onChange={(event) => updateLine(line.id, { wastePct: event.target.value })} required={!zeroIncrementalCost} value={line.wastePct} />
            </label>
            <button aria-label="Remove recipe line" className="focus-ring self-end rounded-lg p-2 text-red-700" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))} type="button"><Trash2 size={17} /></button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="focus-ring inline-flex items-center gap-2 rounded-lg border border-stone-300 px-3 py-2 text-sm font-black" disabled={zeroIncrementalCost} onClick={() => { const id = nextId.current++; setLines((current) => [...current, { id, ingredientId: "", quantity: "", wastePct: "0" }]); }} type="button"><Plus size={16} /> Add line</button>
        <button className="focus-ring rounded-lg bg-leaf px-4 py-2.5 text-sm font-black text-white" type="submit">Save new revision</button>
      </div>
      <p className="text-xs text-stone-500">A selected option needs its own explicit recipe, even when its incremental cost is intentionally zero. Existing order snapshots never change.</p>
    </form>
  );
}

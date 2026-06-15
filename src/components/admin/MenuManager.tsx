import {
  addCategoryAction,
  addMenuItemAction,
  deleteMenuItemAction,
  updateMenuItemAction
} from "@/app/actions";
import { formatAED } from "@/lib/currency";
import type { MenuCategory, MenuItem } from "@/lib/types";

export function MenuManager({
  categories,
  items,
  canWrite
}: {
  categories: MenuCategory[];
  items: MenuItem[];
  canWrite: boolean;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <form action={addCategoryAction} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="font-black">Add category</h2>
          <input
            className="focus-ring mt-3 w-full rounded-lg border border-stone-200 px-3 py-2"
            disabled={!canWrite}
            name="name"
            placeholder="Breakfast"
            required
          />
          <button
            className="focus-ring mt-3 w-full rounded-lg bg-ink px-4 py-2 font-bold text-white disabled:opacity-50"
            disabled={!canWrite}
            type="submit"
          >
            Add category
          </button>
        </form>

        <form action={addMenuItemAction} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="font-black">Add menu item</h2>
          <div className="mt-3 space-y-3">
            <input className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2" disabled={!canWrite} name="name" placeholder="Item name" required />
            <textarea className="focus-ring min-h-20 w-full rounded-lg border border-stone-200 px-3 py-2" disabled={!canWrite} name="description" placeholder="Description" />
            <input className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2" disabled={!canWrite} min="0" name="price" placeholder="Price" required step="0.01" type="number" />
            <select className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2" disabled={!canWrite} name="category_id" required>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <input className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2" disabled={!canWrite} name="image_url" placeholder="Image URL" />
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input defaultChecked disabled={!canWrite} name="is_available" type="checkbox" />
              Available
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input disabled={!canWrite} name="is_featured" type="checkbox" />
              Featured
            </label>
          </div>
          <button
            className="focus-ring mt-3 w-full rounded-lg bg-leaf px-4 py-2 font-bold text-white disabled:opacity-50"
            disabled={!canWrite}
            type="submit"
          >
            Add item
          </button>
        </form>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <article className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm" key={item.id}>
            <form action={updateMenuItemAction} className="grid gap-3 lg:grid-cols-[1.1fr_1.5fr_110px_180px_auto]">
              <input name="item_id" type="hidden" value={item.id} />
              <input className="focus-ring rounded-lg border border-stone-200 px-3 py-2 font-bold" defaultValue={item.name} disabled={!canWrite} name="name" required />
              <input className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm" defaultValue={item.description ?? ""} disabled={!canWrite} name="description" />
              <input className="focus-ring rounded-lg border border-stone-200 px-3 py-2" defaultValue={item.price} disabled={!canWrite} min="0" name="price" step="0.01" type="number" />
              <select className="focus-ring rounded-lg border border-stone-200 px-3 py-2" defaultValue={item.category_id} disabled={!canWrite} name="category_id">
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <button className="focus-ring rounded-lg bg-ink px-4 py-2 font-bold text-white disabled:opacity-50" disabled={!canWrite} type="submit">
                Save
              </button>
              <input className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm lg:col-span-2" defaultValue={item.image_url ?? ""} disabled={!canWrite} name="image_url" placeholder="Image URL" />
              <div className="flex flex-wrap items-center gap-4 text-sm lg:col-span-2">
                <label className="flex items-center gap-2 font-semibold">
                  <input defaultChecked={item.is_available} disabled={!canWrite} name="is_available" type="checkbox" />
                  Available
                </label>
                <label className="flex items-center gap-2 font-semibold">
                  <input defaultChecked={item.is_featured} disabled={!canWrite} name="is_featured" type="checkbox" />
                  Featured
                </label>
                <span className="font-black text-leaf">{formatAED(item.price)}</span>
              </div>
            </form>
            <form action={deleteMenuItemAction} className="mt-3">
              <input name="item_id" type="hidden" value={item.id} />
              <button className="focus-ring text-sm font-bold text-red-600 disabled:opacity-50" disabled={!canWrite} type="submit">
                Delete item
              </button>
            </form>
          </article>
        ))}
      </div>
    </div>
  );
}

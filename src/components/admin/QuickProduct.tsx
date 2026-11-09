"use client";
import { useRef, useState } from "react";
import { createQuickProduct } from "@/app/admin/orders/quick-product-actions";
import type { MenuItem, MenuWithCategories } from "@/lib/types";

export function QuickProduct({ menu, search, categoryId, disabled, onAdd }: { menu: MenuWithCategories; search: string; categoryId: string; disabled: boolean; onAdd: (item: MenuItem, quantity: number) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<Parameters<typeof createQuickProduct>[0] | null>(null);
  const matches = name.trim() ? menu.items.filter(i => i.name.toLowerCase().includes(name.trim().toLowerCase())).slice(0, 5) : [];
  return <div className="mt-3">
    <button type="button" disabled={disabled} className="focus-ring rounded-lg border border-leaf px-3 py-2 font-bold text-leaf disabled:opacity-50" onClick={() => { setName(attempt.current?.name ?? search); setOpen(true); setError(""); }}>+ New product{search ? `: ${search}` : ""}</button>
    {open ? <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="New product">
      <form className="w-full max-w-md space-y-3 rounded-lg bg-white p-5" onSubmit={async event => {
        event.preventDefault(); if (busy) return;
        if (!navigator.onLine) { setError("Reconnect to create a product. Your bill is saved separately."); return; }
        const data = new FormData(event.currentTarget);
        attempt.current ??= { id: crypto.randomUUID(), name, price: Number(data.get("price")), categoryId: String(data.get("category")) };
        setBusy(true); setError("");
        try { const result = await createQuickProduct(attempt.current); if (result.item) { onAdd(result.item, Number(data.get("quantity"))); attempt.current = null; setOpen(false); } else { if (!result.retryUnchanged) attempt.current = null; setError(result.error ?? "Save failed. Retry."); } }
        catch { setError("Connection interrupted. Retry to check the same product save."); }
        finally { setBusy(false); }
      }}>
        <h2 className="text-xl font-black">New product</h2>
        <p className="text-sm text-stone-600">Saved for staff billing. A manager can publish it in Menu later.</p>
        <label className="block">Name<input required maxLength={120} value={name} disabled={busy || !!attempt.current} onChange={e => setName(e.target.value)} className="block w-full rounded border p-2" /></label>
        {!attempt.current && matches.length ? <div className="text-sm">Similar products:{matches.map(item => <button className="block text-leaf underline" key={item.id} type="button" disabled={!item.is_available} onClick={() => { onAdd(item, 1); setOpen(false); }}>{item.name}{!item.is_available ? " (unavailable)" : " — use existing"}</button>)}</div> : null}
        <label className="block">Price<input className="block w-full rounded border p-2" name="price" defaultValue={attempt.current?.price} required min="0.01" max="100000" step="0.01" type="number" readOnly={busy || !!attempt.current} /></label>
        <label className="block">Category<select aria-label="Category" className="block w-full rounded border p-2" name="category" required defaultValue={attempt.current?.categoryId ?? (categoryId === "all" ? "" : categoryId)} disabled={busy || !!attempt.current}><option value="" disabled>Choose category</option>{menu.categories.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="block">Quantity<input className="block w-full rounded border p-2" name="quantity" required min="1" max="99" step="1" type="number" defaultValue="1" readOnly={busy} /></label>
        {error ? <p role="alert" className="text-rose-700">{error}</p> : null}
        <div className="flex gap-3"><button className="rounded bg-leaf p-2 font-bold text-white" disabled={busy} type="submit">{busy ? "Saving…" : attempt.current ? "Retry save & add" : "Save & add to bill"}</button><button type="button" disabled={busy} onClick={() => setOpen(false)}>Close</button></div>
      </form>
    </div> : null}
  </div>;
}

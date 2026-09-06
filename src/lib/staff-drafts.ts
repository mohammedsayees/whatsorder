import type { CartLineOption, FulfilmentType } from "./types";
import type { StaffOrderPayload } from "./staff-order-payload";

export type DraftLine = { itemId: string; name: string; nameAr: string | null; price: number; quantity: number; options?: CartLineOption[] };
export type StaffDraft = {
  id: string; scope: string; revision: number; updatedAt: string;
  lines: Record<string, DraftLine>; fields: Record<string, string>; fulfilmentType: FulfilmentType;
  attempt?: { id: string; payload?: StaffOrderPayload };
};

// Separate from submitted orders: drafts are never automatically sent to the server.
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("whatsorder-staff-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "id" }).createIndex("scope", "scope");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listDrafts(scope: string): Promise<StaffDraft[]> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readonly");
    const req = tx.objectStore("drafts").index("scope").getAll(scope);
    tx.oncomplete = () => resolve((req.result as StaffDraft[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}

export async function writeDraft(draft: StaffDraft, remove = false): Promise<void> {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    const store = tx.objectStore("drafts");
    const req = store.get(draft.id);
    let conflict = false;
    req.onsuccess = () => {
      const previous = req.result as StaffDraft | undefined;
      if ((previous?.revision ?? 0) !== draft.revision - (remove ? 0 : 1) || (previous && previous.scope !== draft.scope)) { conflict = true; tx.abort(); return; }
      if (remove) store.delete(draft.id); else store.put(draft);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error(conflict ? "This draft changed in another tab. Reload before continuing." : "Draft saving failed. Keep this page open and retry."));
  }); } finally { db.close(); }
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { listDrafts, writeDraft, type StaffDraft } from "@/lib/staff-drafts";
import type { FulfilmentType } from "@/lib/types";

export function useStaffDraft(scope: string, fulfilmentType: FulfilmentType) {
  const [draft, setDraft] = useState<StaffDraft | null>(null);
  const [drafts, setDrafts] = useState<StaffDraft[]>([]);
  const [status, setStatus] = useState("Loading drafts…");
  const [error, setError] = useState("");
  const current = useRef<StaffDraft | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const unsaved = useRef(false);
  const blank = useCallback((): StaffDraft => ({ id: crypto.randomUUID(), scope, revision: 0, updatedAt: new Date().toISOString(), lines: {}, fields: {}, fulfilmentType }), [scope, fulfilmentType]);
  useEffect(() => {
    let active = true;
    listDrafts(scope).then(rows => {
      if (!active) return;
      const restored = rows[0] ?? blank();
      current.current = restored; setDraft(restored); setDrafts(rows); setStatus(rows.length ? "Draft restored on this device" : "Ready · drafts save on this device");
    }).catch(() => { if (active) setError("Draft storage is unavailable. Enable browser storage and reload before billing."); });
    return () => { active = false; };
  }, [scope, blank]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (unsaved.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);

  function patch(changes: Partial<Pick<StaffDraft, "lines" | "fields" | "fulfilmentType" | "attempt">>) {
    if (!current.current || error) return Promise.reject(new Error(error || "Draft is loading"));
    const next = { ...current.current, ...changes, revision: current.current.revision + 1, updatedAt: new Date().toISOString() };
    current.current = next; unsaved.current = true; setDraft(next); setStatus("Saving draft…");
    const task = chain.current.then(() => writeDraft(next));
    chain.current = task;
    void task.then(async () => { if (current.current?.revision === next.revision && current.current?.id === next.id) { unsaved.current = false; setStatus("Draft saved on this device"); } setDrafts(await listDrafts(scope)); }).catch(e => setError(e instanceof Error ? e.message : "Draft saving failed. Keep this page open."));
    return task;
  }

  async function finish() {
    await chain.current;
    const old = current.current;
    if (old && old.revision > 0) await writeDraft(old, true);
    const next = blank(); current.current = next; setDraft(next); setDrafts(await listDrafts(scope)); setStatus("Ready · drafts save on this device");
  }
  async function hold() {
    await chain.current;
    const next = blank(); current.current = next; setDraft(next); setDrafts(await listDrafts(scope)); setStatus("Bill held on this device");
  }
  async function resume(id: string) {
    await chain.current;
    const rows = await listDrafts(scope); const next = rows.find(row => row.id === id);
    if (next) { current.current = next; setDraft(next); setDrafts(rows); setStatus("Draft restored on this device"); }
  }
  return { draft, drafts, status, error, patch, finish, hold, resume };
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Plus } from "lucide-react";
import {
  addMenuOptionAction,
  addOptionGroupAction,
  deleteMenuOptionAction,
  deleteOptionGroupAction,
  moveMenuOptionAction,
  moveOptionGroupAction,
  toggleMenuOptionAvailabilityAction,
  updateOptionGroupAction
} from "@/app/actions";
import { formatCurrency } from "@/lib/currency";
import type { MenuOptionCatalog, MenuOptionGroup, Restaurant } from "@/lib/types";

// "Variant" = exactly one required choice (Size). "Add-ons" = optional
// multi-select. The kind selector just maps to min/max so the schema stays
// a single unified model.
type GroupKind = "variant" | "addons";

function groupKind(group: MenuOptionGroup): GroupKind {
  return group.min_select === 1 && group.max_select === 1 ? "variant" : "addons";
}

function kindLabel(group: MenuOptionGroup): string {
  if (groupKind(group) === "variant") {
    return "Variant — customer picks exactly one";
  }
  const max = group.max_select;
  return max ? `Add-ons — up to ${max}` : "Add-ons — any number";
}

function formatDelta(delta: number, restaurant: Restaurant): string {
  if (delta === 0) {
    return "+0";
  }
  return `${delta > 0 ? "+" : "−"}${formatCurrency(Math.abs(delta), restaurant)}`;
}

function KindFields({
  defaultKind,
  defaultMax,
  disabled
}: {
  defaultKind: GroupKind;
  defaultMax: number | null;
  disabled: boolean;
}) {
  const [kind, setKind] = useState<GroupKind>(defaultKind);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <select
        className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2"
        disabled={disabled}
        name="kind"
        onChange={(event) => setKind(event.target.value as GroupKind)}
        value={kind}
      >
        <option value="variant">Variant (pick exactly one, e.g. Size)</option>
        <option value="addons">Add-ons (optional extras)</option>
      </select>
      {kind === "variant" ? (
        <>
          <input name="min_select" type="hidden" value="1" />
          <input name="max_select" type="hidden" value="1" />
        </>
      ) : (
        <>
          <input name="min_select" type="hidden" value="0" />
          <input
            className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2"
            defaultValue={defaultMax ?? ""}
            disabled={disabled}
            max="10"
            min="1"
            name="max_select"
            placeholder="Max choices (blank = no limit)"
            type="number"
          />
        </>
      )}
    </div>
  );
}

export function OptionGroupsManager({
  canWrite,
  catalog,
  restaurant,
  restaurantId
}: {
  canWrite: boolean;
  catalog: MenuOptionCatalog;
  restaurant: Restaurant;
  restaurantId?: string;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const sortedGroups = useMemo(
    () =>
      [...catalog.groups].sort(
        (first, second) => first.display_order - second.display_order
      ),
    [catalog.groups]
  );
  const optionsByGroupId = useMemo(() => {
    const map = new Map<string, MenuOptionCatalog["options"]>();
    for (const option of [...catalog.options].sort(
      (first, second) => first.display_order - second.display_order
    )) {
      const list = map.get(option.group_id) ?? [];
      list.push(option);
      map.set(option.group_id, list);
    }
    return map;
  }, [catalog.options]);
  const linkedItemCountByGroupId = useMemo(() => {
    const map = new Map<string, number>();
    for (const link of catalog.links) {
      map.set(link.group_id, (map.get(link.group_id) ?? 0) + 1);
    }
    return map;
  }, [catalog.links]);

  const submitAndRefresh = (action: (formData: FormData) => Promise<void>) =>
    async (formData: FormData) => {
      setFormError(null);
      try {
        await action(formData);
        router.refresh();
      } catch (error) {
        setFormError(
          error instanceof Error ? error.message : "The change could not be saved."
        );
      }
    };

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">Variants &amp; add-ons</h2>
          <p className="mt-1 text-sm text-stone-600">
            Reusable option groups — create &quot;Size&quot; or &quot;Extras&quot; once, then
            attach them to items from the item editor.
          </p>
        </div>
        <button
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-black text-white disabled:opacity-50"
          disabled={!canWrite}
          onClick={() => setAddOpen((open) => !open)}
          type="button"
        >
          <Plus size={16} />
          New group
        </button>
      </div>

      {formError ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {formError}
        </p>
      ) : null}

      {addOpen ? (
        <form
          action={submitAndRefresh(async (formData) => {
            await addOptionGroupAction(formData);
            setAddOpen(false);
          })}
          className="mt-4 space-y-3 rounded-lg border border-dashed border-stone-300 bg-linen/50 p-4"
        >
          {restaurantId ? (
            <input name="restaurant_id" type="hidden" value={restaurantId} />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2"
              disabled={!canWrite}
              name="name"
              placeholder="Group name (e.g. Size)"
              required
            />
            <input
              className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2 text-right"
              dir="rtl"
              disabled={!canWrite}
              name="name_ar"
              placeholder="اسم المجموعة بالعربية"
            />
          </div>
          <KindFields defaultKind="variant" defaultMax={null} disabled={!canWrite} />
          <button
            className="focus-ring w-full rounded-lg bg-leaf px-4 py-2 font-black text-white disabled:opacity-50"
            disabled={!canWrite}
            type="submit"
          >
            Create group
          </button>
        </form>
      ) : null}

      {sortedGroups.length === 0 && !addOpen ? (
        <p className="mt-4 rounded-lg bg-stone-50 p-4 text-sm text-stone-500">
          No option groups yet. Create &quot;Size&quot; with Small/Large, or
          &quot;Extras&quot; with add-ons, then attach them to menu items.
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {sortedGroups.map((group, index) => {
          const options = optionsByGroupId.get(group.id) ?? [];
          const linkedCount = linkedItemCountByGroupId.get(group.id) ?? 0;
          const expanded = expandedGroupId === group.id;

          return (
            <div className="rounded-lg border border-stone-200" key={group.id}>
              <div className="flex flex-wrap items-center gap-3 p-3">
                <div className="flex flex-col gap-1">
                  <form action={submitAndRefresh(moveOptionGroupAction)}>
                    {restaurantId ? (
                      <input name="restaurant_id" type="hidden" value={restaurantId} />
                    ) : null}
                    <input name="group_id" type="hidden" value={group.id} />
                    <input name="direction" type="hidden" value="up" />
                    <button
                      aria-label={`Move ${group.name} up`}
                      className="focus-ring rounded p-1 text-stone-500 disabled:opacity-30"
                      disabled={!canWrite || index === 0}
                      type="submit"
                    >
                      <ArrowUp size={14} />
                    </button>
                  </form>
                  <form action={submitAndRefresh(moveOptionGroupAction)}>
                    {restaurantId ? (
                      <input name="restaurant_id" type="hidden" value={restaurantId} />
                    ) : null}
                    <input name="group_id" type="hidden" value={group.id} />
                    <input name="direction" type="hidden" value="down" />
                    <button
                      aria-label={`Move ${group.name} down`}
                      className="focus-ring rounded p-1 text-stone-500 disabled:opacity-30"
                      disabled={!canWrite || index === sortedGroups.length - 1}
                      type="submit"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </form>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-black">
                    {group.name}
                    {group.name_ar ? (
                      <span className="ml-2 text-sm font-bold text-stone-500">{group.name_ar}</span>
                    ) : null}
                  </p>
                  <p className="text-xs font-bold text-stone-500">
                    {kindLabel(group)} · {options.length} option{options.length === 1 ? "" : "s"} ·
                    attached to {linkedCount} item{linkedCount === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  className="focus-ring inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-black"
                  onClick={() => {
                    setExpandedGroupId(expanded ? null : group.id);
                    setEditingGroupId(null);
                  }}
                  type="button"
                >
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {expanded ? "Close" : "Options"}
                </button>
                <button
                  className="focus-ring rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-black disabled:opacity-50"
                  disabled={!canWrite}
                  onClick={() => {
                    setEditingGroupId(editingGroupId === group.id ? null : group.id);
                    setExpandedGroupId(group.id);
                  }}
                  type="button"
                >
                  Edit
                </button>
                <form
                  action={submitAndRefresh(deleteOptionGroupAction)}
                  onSubmit={(event) => {
                    if (
                      !window.confirm(
                        `Delete "${group.name}"? It will be detached from ${linkedCount} item${linkedCount === 1 ? "" : "s"} and its options removed.`
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                >
                  {restaurantId ? (
                    <input name="restaurant_id" type="hidden" value={restaurantId} />
                  ) : null}
                  <input name="group_id" type="hidden" value={group.id} />
                  <button
                    className="focus-ring rounded-lg px-3 py-1.5 text-xs font-black text-red-600 disabled:opacity-50"
                    disabled={!canWrite}
                    type="submit"
                  >
                    Delete
                  </button>
                </form>
              </div>

              {expanded ? (
                <div className="space-y-3 border-t border-stone-100 p-3">
                  {editingGroupId === group.id ? (
                    <form
                      action={submitAndRefresh(async (formData) => {
                        await updateOptionGroupAction(formData);
                        setEditingGroupId(null);
                      })}
                      className="space-y-3 rounded-lg bg-linen/50 p-3"
                    >
                      {restaurantId ? (
                        <input name="restaurant_id" type="hidden" value={restaurantId} />
                      ) : null}
                      <input name="group_id" type="hidden" value={group.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input
                          className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2"
                          defaultValue={group.name}
                          disabled={!canWrite}
                          name="name"
                          required
                        />
                        <input
                          className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2 text-right"
                          defaultValue={group.name_ar ?? ""}
                          dir="rtl"
                          disabled={!canWrite}
                          name="name_ar"
                          placeholder="اسم المجموعة بالعربية"
                        />
                      </div>
                      <KindFields
                        defaultKind={groupKind(group)}
                        defaultMax={group.max_select}
                        disabled={!canWrite}
                      />
                      <button
                        className="focus-ring w-full rounded-lg bg-ink px-4 py-2 text-sm font-black text-white disabled:opacity-50"
                        disabled={!canWrite}
                        type="submit"
                      >
                        Save group
                      </button>
                    </form>
                  ) : null}

                  {options.map((option, optionIndex) => (
                    <div
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-100 bg-white px-3 py-2"
                      key={option.id}
                    >
                      <div className="flex gap-1">
                        <form action={submitAndRefresh(moveMenuOptionAction)}>
                          {restaurantId ? (
                            <input name="restaurant_id" type="hidden" value={restaurantId} />
                          ) : null}
                          <input name="option_id" type="hidden" value={option.id} />
                          <input name="direction" type="hidden" value="up" />
                          <button
                            aria-label={`Move ${option.name} up`}
                            className="focus-ring rounded p-1 text-stone-400 disabled:opacity-30"
                            disabled={!canWrite || optionIndex === 0}
                            type="submit"
                          >
                            <ArrowUp size={12} />
                          </button>
                        </form>
                        <form action={submitAndRefresh(moveMenuOptionAction)}>
                          {restaurantId ? (
                            <input name="restaurant_id" type="hidden" value={restaurantId} />
                          ) : null}
                          <input name="option_id" type="hidden" value={option.id} />
                          <input name="direction" type="hidden" value="down" />
                          <button
                            aria-label={`Move ${option.name} down`}
                            className="focus-ring rounded p-1 text-stone-400 disabled:opacity-30"
                            disabled={!canWrite || optionIndex === options.length - 1}
                            type="submit"
                          >
                            <ArrowDown size={12} />
                          </button>
                        </form>
                      </div>
                      <p className="min-w-0 flex-1 text-sm font-bold">
                        {option.name}
                        {option.name_ar ? (
                          <span className="ml-2 text-xs text-stone-500">{option.name_ar}</span>
                        ) : null}
                        <span className="ml-2 text-xs font-black text-leaf">
                          {formatDelta(option.price_delta, restaurant)}
                        </span>
                      </p>
                      <form action={submitAndRefresh(toggleMenuOptionAvailabilityAction)}>
                        {restaurantId ? (
                          <input name="restaurant_id" type="hidden" value={restaurantId} />
                        ) : null}
                        <input name="option_id" type="hidden" value={option.id} />
                        <input
                          name="is_available"
                          type="hidden"
                          value={String(!option.is_available)}
                        />
                        <button
                          className={`focus-ring rounded-full px-3 py-1 text-xs font-black disabled:opacity-50 ${option.is_available ? "bg-mint/20 text-leaf" : "bg-stone-100 text-stone-500"}`}
                          disabled={!canWrite}
                          type="submit"
                        >
                          {option.is_available ? "Available" : "Unavailable"}
                        </button>
                      </form>
                      <form
                        action={submitAndRefresh(deleteMenuOptionAction)}
                        onSubmit={(event) => {
                          if (!window.confirm(`Delete "${option.name}"? This cannot be undone.`)) {
                            event.preventDefault();
                          }
                        }}
                      >
                        {restaurantId ? (
                          <input name="restaurant_id" type="hidden" value={restaurantId} />
                        ) : null}
                        <input name="option_id" type="hidden" value={option.id} />
                        <button
                          className="focus-ring rounded px-2 py-1 text-xs font-black text-red-600 disabled:opacity-50"
                          disabled={!canWrite}
                          type="submit"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  ))}

                  <form
                    action={submitAndRefresh(addMenuOptionAction)}
                    className="flex flex-wrap items-center gap-2"
                  >
                    {restaurantId ? (
                      <input name="restaurant_id" type="hidden" value={restaurantId} />
                    ) : null}
                    <input name="group_id" type="hidden" value={group.id} />
                    <input
                      className="focus-ring min-w-32 flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm"
                      disabled={!canWrite}
                      name="name"
                      placeholder="Option name (e.g. Large)"
                      required
                    />
                    <input
                      className="focus-ring w-36 rounded-lg border border-stone-200 px-3 py-2 text-right text-sm"
                      dir="rtl"
                      disabled={!canWrite}
                      name="name_ar"
                      placeholder="بالعربية"
                    />
                    <input
                      className="focus-ring w-28 rounded-lg border border-stone-200 px-3 py-2 text-sm"
                      disabled={!canWrite}
                      name="price_delta"
                      placeholder={`+ ${restaurant.currency_code ?? "AED"}`}
                      step="0.25"
                      type="number"
                    />
                    <button
                      className="focus-ring rounded-lg bg-ink px-3 py-2 text-sm font-black text-white disabled:opacity-50"
                      disabled={!canWrite}
                      type="submit"
                    >
                      Add option
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

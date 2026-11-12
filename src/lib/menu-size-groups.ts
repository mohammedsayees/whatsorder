import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import {
  SIZE_GROUP_NAME,
  SIZE_GROUP_NAME_AR,
  sizeSignature,
  type SizeChoice
} from "@/lib/size-variants";

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

// Attaches a required single-choice "Size" option group to each item. Groups
// are restaurant-level and reusable, but price differences live on the
// options, so items share a group only when their sizes AND price
// differences match exactly. Existing identical Size groups are reused.
// Every read and write is scoped to restaurantId. Returns how many items got
// sizes; failures are logged, never thrown (the items are already saved).
export async function attachSizeOptionGroups(
  admin: AdminClient,
  restaurantId: string,
  entries: { itemId: string; sizes: SizeChoice[] }[]
): Promise<number> {
  const wanted = entries.filter((entry) => entry.sizes.length >= 2);
  if (wanted.length === 0) {
    return 0;
  }

  const [{ data: groups }, { data: options }] = await Promise.all([
    admin
      .from("menu_option_groups")
      .select("id, display_order, min_select, max_select")
      .eq("restaurant_id", restaurantId),
    admin
      .from("menu_options")
      .select("group_id, name, price_delta, display_order")
      .eq("restaurant_id", restaurantId)
  ]);

  const optionsByGroup = new Map<string, { name: string; price_delta: number; display_order: number }[]>();
  for (const option of options ?? []) {
    const list = optionsByGroup.get(String(option.group_id)) ?? [];
    list.push({
      name: String(option.name),
      price_delta: Number(option.price_delta),
      display_order: Number(option.display_order)
    });
    optionsByGroup.set(String(option.group_id), list);
  }

  const groupIdBySignature = new Map<string, string>();
  for (const group of groups ?? []) {
    if (group.min_select !== 1 || group.max_select !== 1) {
      continue;
    }
    const groupOptions = (optionsByGroup.get(String(group.id)) ?? []).sort(
      (a, b) => a.display_order - b.display_order
    );
    groupIdBySignature.set(
      sizeSignature(groupOptions.map((option) => ({ name: option.name, priceDelta: option.price_delta }))),
      String(group.id)
    );
  }

  let nextDisplayOrder =
    Math.max(0, ...(groups ?? []).map((group) => Number(group.display_order) || 0)) + 1;
  const links: { restaurant_id: string; menu_item_id: string; group_id: string; display_order: number }[] = [];

  for (const entry of wanted) {
    const signature = sizeSignature(entry.sizes);
    let groupId = groupIdBySignature.get(signature);

    if (!groupId) {
      const { data: group, error: groupError } = await admin
        .from("menu_option_groups")
        .insert({
          restaurant_id: restaurantId,
          name: SIZE_GROUP_NAME,
          name_ar: SIZE_GROUP_NAME_AR,
          min_select: 1,
          max_select: 1,
          display_order: nextDisplayOrder
        })
        .select("id")
        .single();
      if (groupError || !group) {
        console.error("WhatsOrder size group insert failed", { restaurantId, message: groupError?.message });
        continue;
      }

      const { error: optionsError } = await admin.from("menu_options").insert(
        entry.sizes.map((size, index) => ({
          restaurant_id: restaurantId,
          group_id: group.id,
          name: size.name.slice(0, 60),
          price_delta: size.priceDelta,
          is_available: true,
          display_order: index
        }))
      );
      if (optionsError) {
        console.error("WhatsOrder size options insert failed", { restaurantId, message: optionsError.message });
        await admin.from("menu_option_groups").delete().eq("id", group.id).eq("restaurant_id", restaurantId);
        continue;
      }

      groupId = String(group.id);
      groupIdBySignature.set(signature, groupId);
      nextDisplayOrder += 1;
    }

    links.push({ restaurant_id: restaurantId, menu_item_id: entry.itemId, group_id: groupId, display_order: 0 });
  }

  if (links.length === 0) {
    return 0;
  }
  const { error: linkError } = await admin.from("menu_item_option_groups").insert(links);
  if (linkError) {
    console.error("WhatsOrder size group links failed", { restaurantId, message: linkError.message });
    return 0;
  }
  return links.length;
}

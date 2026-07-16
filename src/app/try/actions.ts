"use server";

import { createHash } from "crypto";

import { headers } from "next/headers";

import { getSupabaseAdmin } from "@/lib/supabase";
import { extractMenuPageItems } from "@/lib/menu-extraction/extract";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";
import {
  DEMO_BUILDS_PER_DAY,
  DEMO_MAX_PAGES,
  FOUNDER_WHATSAPP_NUMBER,
  buildDemoSlug,
  dedupeDraftItems,
  demoExpiryDate,
  validateDemoRestaurantName
} from "@/lib/demo-store";
import { revalidatePublicRestaurantCache } from "@/lib/public-cache";

// Instant demo store builder (self-serve funnel, PRD Phase 1). Public-facing:
// no auth, so every input is validated here and writes go through the
// service-role client only. Real tenants are never touched — everything this
// action creates is flagged is_demo and purged by the demo-cleanup cron.

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
// Matches the admin importer's budget: one downscaled page stays well under
// this, and it keeps the request under the server-action body limit.
const MAX_IMAGE_BASE64_LENGTH = 10_000_000;

export type DemoBuildResult =
  | { ok: true; slug: string; url: string; itemCount: number; ownerWhatsApp: string | null }
  | { ok: false; error: string; rateLimited?: boolean };

type DemoPage = { imageBase64: string; mimeType: string };

// Salted hash so the rate limiter never stores a raw IP (PDPL: data
// minimisation for prospects who haven't consented to anything yet).
function hashDemoIp(ip: string): string {
  const salt = process.env.DEMO_IP_SALT ?? "whatsorder-demo-v1";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

async function clientIpHash(): Promise<string> {
  const headerBag = await headers();
  const forwarded = headerBag.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || headerBag.get("x-real-ip") || "unknown";
  return hashDemoIp(ip);
}

async function notifyFounder(payload: {
  name: string;
  slug: string;
  url: string;
  ownerWhatsApp: string | null;
}) {
  // Optional webhook (e.g. a Zapier/Make hook that pings WhatsApp). Failures
  // are logged and swallowed — the prospect's build must never fail because
  // the notification did.
  const webhook = process.env.DEMO_NOTIFY_WEBHOOK;
  if (!webhook) {
    console.info("WhatsOrder demo store built", payload);
    return;
  }

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "demo_store_built", ...payload })
    });
  } catch (error) {
    console.error("WhatsOrder demo notification failed", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function buildDemoStoreAction(input: {
  restaurantName: string;
  pages: DemoPage[];
  // Optional lead capture: the prospect's own WhatsApp number, so follow-up
  // has a channel even if they never tap a CTA.
  ownerWhatsApp?: string;
}): Promise<DemoBuildResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !process.env.GEMINI_API_KEY) {
    return {
      ok: false,
      error: "The demo builder is not available right now. Message us on WhatsApp and we'll build it for you."
    };
  }

  const name = validateDemoRestaurantName(String(input.restaurantName ?? ""));
  if (!name) {
    return { ok: false, error: "Enter your restaurant name (at least 2 characters)." };
  }

  // Optional and best-effort: an unparseable number is dropped, never a blocker.
  const ownerPhone = input.ownerWhatsApp
    ? normalizeWhatsAppNumber(String(input.ownerWhatsApp).slice(0, 20)) || null
    : null;

  const pages = (Array.isArray(input.pages) ? input.pages : []).slice(0, DEMO_MAX_PAGES);
  if (pages.length === 0) {
    return { ok: false, error: "Add a photo of your menu." };
  }
  for (const page of pages) {
    if (!allowedMimeTypes.has(page.mimeType)) {
      return { ok: false, error: "Menu photos must be JPEG, PNG, or WebP images." };
    }
    if (!page.imageBase64 || page.imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
      return { ok: false, error: "That photo is too large. Try a smaller one." };
    }
  }

  // Rate limit per (hashed) IP per rolling 24h. Counting rows in the DB works
  // across serverless instances, unlike in-memory counters.
  const ipHash = await clientIpHash();
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentBuilds, error: rateError } = await supabase
    .from("restaurants")
    .select("id", { count: "exact", head: true })
    .eq("is_demo", true)
    .eq("demo_ip_hash", ipHash)
    .gte("created_at", windowStart);

  if (rateError) {
    console.error("WhatsOrder demo rate-limit check failed", { message: rateError.message });
    return { ok: false, error: "Something went wrong. Try again in a moment." };
  }
  if ((recentBuilds ?? 0) >= DEMO_BUILDS_PER_DAY) {
    return {
      ok: false,
      rateLimited: true,
      error: "You've reached today's demo limit. Message us on WhatsApp and we'll build your store for you."
    };
  }

  // Read the menu before creating anything, so a failed extraction leaves no
  // orphan tenant behind.
  let drafts;
  try {
    const perPage = await Promise.all(
      pages.map((page) => extractMenuPageItems(page.imageBase64, page.mimeType, "AED"))
    );
    drafts = dedupeDraftItems(perPage.flat());
  } catch (error) {
    console.error("WhatsOrder demo extraction failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    return {
      ok: false,
      error: "We couldn't read that menu. Try a clearer photo, or message us on WhatsApp and we'll build it for you."
    };
  }

  if (drafts.length === 0) {
    return {
      ok: false,
      error: "We couldn't find any priced items in that photo. Try a clearer photo of the menu itself."
    };
  }

  const slug = buildDemoSlug(name);
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .insert({
      name,
      slug,
      // Test orders open a wa.me link to the founder's number — the prospect's
      // "customer experience" doubles as our lead signal. No WhatsApp API use.
      whatsapp_number: FOUNDER_WHATSAPP_NUMBER,
      subtitle: "Demo store — built by AI from a menu photo",
      status: "trial",
      plan: "trial",
      is_active: true,
      is_demo: true,
      demo_expires_at: demoExpiryDate().toISOString(),
      demo_ip_hash: ipHash,
      owner_phone: ownerPhone,
      delivery_fee: 0,
      minimum_order_amount: 0
    })
    .select("id, slug")
    .single();

  if (restaurantError || !restaurant) {
    // Slug collision is the only expected failure; one retry with a new suffix.
    const retrySlug = buildDemoSlug(name);
    const { data: retry, error: retryError } = await supabase
      .from("restaurants")
      .insert({
        name,
        slug: retrySlug,
        whatsapp_number: FOUNDER_WHATSAPP_NUMBER,
        subtitle: "Demo store — built by AI from a menu photo",
        status: "trial",
        plan: "trial",
        is_active: true,
        is_demo: true,
        demo_expires_at: demoExpiryDate().toISOString(),
        demo_ip_hash: ipHash,
        owner_phone: ownerPhone,
        delivery_fee: 0,
        minimum_order_amount: 0
      })
      .select("id, slug")
      .single();

    if (retryError || !retry) {
      console.error("WhatsOrder demo restaurant insert failed", {
        message: retryError?.message ?? restaurantError?.message
      });
      return { ok: false, error: "Could not create your demo store. Try again in a moment." };
    }

    return finishBuild(supabase, retry, name, drafts, ownerPhone);
  }

  return finishBuild(supabase, restaurant, name, drafts, ownerPhone);
}

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

async function finishBuild(
  supabase: AdminClient,
  restaurant: { id: string; slug: string },
  name: string,
  drafts: ReturnType<typeof dedupeDraftItems>,
  ownerPhone: string | null
): Promise<DemoBuildResult> {
  const categoryNames = [...new Set(drafts.map((row) => row.category.trim() || "Menu"))];
  const { data: categories, error: categoryError } = await supabase
    .from("menu_categories")
    .insert(
      categoryNames.map((categoryName, index) => ({
        restaurant_id: restaurant.id,
        name: categoryName,
        display_order: index + 1,
        is_active: true
      }))
    )
    .select("id,name");

  if (categoryError || !categories) {
    await supabase.from("restaurants").delete().eq("id", restaurant.id).eq("is_demo", true);
    return { ok: false, error: "Could not build your demo menu. Try again in a moment." };
  }

  const categoryIdByName = new Map(
    categories.map((category) => [String(category.name).trim().toLowerCase(), category.id])
  );

  const items = drafts.map((row) => ({
    restaurant_id: restaurant.id,
    category_id:
      categoryIdByName.get((row.category.trim() || "Menu").toLowerCase()) ?? categories[0].id,
    name: row.name.slice(0, 120),
    name_ar: row.name_ar ? row.name_ar.slice(0, 120) : null,
    description: row.description ? row.description.slice(0, 300) : null,
    price: row.price,
    is_available: true,
    is_featured: row.is_featured === true
  }));

  const { error: itemsError } = await supabase.from("menu_items").insert(items);
  if (itemsError) {
    await supabase.from("restaurants").delete().eq("id", restaurant.id).eq("is_demo", true);
    return { ok: false, error: "Could not save your demo menu. Try again in a moment." };
  }

  revalidatePublicRestaurantCache({ id: restaurant.id, slug: restaurant.slug });

  const url = `/r/${restaurant.slug}`;
  await notifyFounder({ name, slug: restaurant.slug, url, ownerWhatsApp: ownerPhone });

  return {
    ok: true,
    slug: restaurant.slug,
    url,
    itemCount: items.length,
    ownerWhatsApp: ownerPhone
  };
}

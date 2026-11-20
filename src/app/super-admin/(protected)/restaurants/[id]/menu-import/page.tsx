import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { MenuImport } from "@/components/admin/MenuImport";
import { requireSuperAdmin } from "@/lib/super-admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Restaurant } from "@/lib/types";

// Vision extraction can take 10-45s per page; allow the server action room to
// finish instead of being killed at the platform default (same as /admin/menu/import).
export const maxDuration = 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SuperAdminMenuImportPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  if (!supabase || !UUID_PATTERN.test(id)) {
    notFound();
  }

  const { data } = await supabase.from("restaurants").select("*").eq("id", id).maybeSingle();
  if (!data) {
    notFound();
  }
  const restaurant = data as Restaurant;
  const backHref = `/super-admin/restaurants/${restaurant.id}?tab=menu`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <Link
        className="focus-ring inline-flex items-center gap-1 text-sm font-bold text-stone-500 hover:text-ink"
        href={backHref}
      >
        <ArrowLeft size={16} />
        Back to {restaurant.name} menu
      </Link>
      <h1 className="mt-2 flex items-center gap-2 text-3xl font-black">
        <Sparkles className="text-leaf" size={26} />
        AI Menu Builder
      </h1>
      <p className="mt-2 text-stone-600">
        Upload {restaurant.name}&apos;s menu as a PDF or photo. The AI reads every item, price and
        Arabic name. Review the items, then publish them to this restaurant&apos;s live menu.
        Existing items are kept; imported items are added alongside them.
      </p>

      <div className="mt-6">
        <MenuImport actingRestaurantId={restaurant.id} doneHref={backHref} restaurant={restaurant} />
      </div>
    </main>
  );
}

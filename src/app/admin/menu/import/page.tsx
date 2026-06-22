import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { MenuImport } from "@/components/admin/MenuImport";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

// Vision extraction can take 10-45s per page; allow the server action room to
// finish instead of being killed at the platform default.
export const maxDuration = 60;

export default async function ImportMenuPage() {
  await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <Link
        className="focus-ring inline-flex items-center gap-1 text-sm font-bold text-stone-500 hover:text-ink"
        href="/admin/menu"
      >
        <ArrowLeft size={16} />
        Back to menu
      </Link>
      <h1 className="mt-2 flex items-center gap-2 text-3xl font-black">
        <Sparkles className="text-leaf" size={26} />
        AI Menu Builder
      </h1>
      <p className="mt-2 text-stone-600">
        Upload your menu as a PDF or photo — our AI reads every item, price, and
        Arabic name, can write descriptions, and you add photos in one pass. Review,
        then publish to your live menu.
      </p>

      <div className="mt-6">
        <MenuImport />
      </div>
    </main>
  );
}

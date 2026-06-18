import Link from "next/link";
import {
  Building2,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  ShieldCheck
} from "lucide-react";
import { logoutSuperAdminAction } from "@/app/super-admin/actions";
import type { SuperAdminSession } from "@/lib/super-admin-auth";

const navItems = [
  { href: "/super-admin", label: "Overview", icon: LayoutDashboard },
  { href: "/super-admin/restaurants", label: "Restaurants", icon: Building2 },
  { href: "/super-admin/onboarding", label: "Onboarding", icon: ClipboardCheck }
];

export function SuperAdminShell({
  children,
  session
}: {
  children: React.ReactNode;
  session: SuperAdminSession;
}) {
  return (
    <div className="min-h-screen bg-[#f6f7f5] text-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-stone-200 bg-[#173d2f] text-white lg:flex lg:flex-col">
        <div className="border-b border-white/10 px-6 py-6">
          <Link className="inline-flex items-center gap-3" href="/super-admin">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-white/10">
              <ShieldCheck size={21} />
            </span>
            <span>
              <span className="block text-lg font-black">WhatsOrder</span>
              <span className="block text-xs font-bold text-white/55">Super Admin</span>
            </span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-5">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                className="focus-ring flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-bold text-white/72 transition hover:bg-white/10 hover:text-white"
                href={item.href}
                key={item.href}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <p className="truncate text-sm font-bold">{session.profile.full_name || "Super Admin"}</p>
          <p className="truncate text-xs text-white/55">{session.email}</p>
          <form action={logoutSuperAdminAction}>
            <button
              className="focus-ring mt-4 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-white/72 hover:bg-white/10 hover:text-white"
              type="submit"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
            <Link className="font-black text-[#173d2f] lg:hidden" href="/super-admin">
              WhatsOrder Admin
            </Link>
            <p className="hidden text-sm font-semibold text-stone-500 lg:block">
              Multi-restaurant operations
            </p>
            <Link
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-leaf px-4 py-2 text-sm font-bold text-white"
              href="/super-admin/restaurants/new"
            >
              <PlusCircle size={17} />
              Add restaurant
            </Link>
          </div>
        </header>

        <div className="pb-20 lg:pb-0">{children}</div>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-stone-200 bg-white p-2 lg:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                className="focus-ring flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-bold text-stone-600 hover:bg-mint hover:text-leaf"
                href={item.href}
                key={item.href}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

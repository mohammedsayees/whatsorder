import Link from "next/link";
import { BarChart3, ClipboardList, MenuSquare, Settings, Users } from "lucide-react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: BarChart3 },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList },
  { href: "/admin/menu", label: "Menu", icon: MenuSquare },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/settings", label: "Settings", icon: Settings }
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  // Future authentication can filter navigation by restaurant_users.role before rendering.
  return (
    <div className="min-h-screen bg-stone-50">
      <aside className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white lg:inset-y-0 lg:left-0 lg:right-auto lg:w-64 lg:border-r lg:border-t-0">
        <div className="hidden px-6 py-6 lg:block">
          <Link className="text-xl font-black text-ink" href="/admin">
            WhatsOrder
          </Link>
          <p className="mt-1 text-sm text-stone-500">Restaurant console</p>
        </div>
        <nav className="grid grid-cols-5 gap-1 p-2 lg:block lg:space-y-1 lg:px-3">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                className="focus-ring flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-bold text-stone-600 hover:bg-mint hover:text-leaf lg:flex-row lg:px-3 lg:py-3 lg:text-sm"
                href={item.href}
                key={item.href}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="pb-24 lg:pb-0 lg:pl-64">{children}</div>
    </div>
  );
}

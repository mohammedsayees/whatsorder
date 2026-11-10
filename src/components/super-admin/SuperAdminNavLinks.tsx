"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ClipboardCheck,
  LayoutDashboard,
  ReceiptText
} from "lucide-react";

const navItems = [
  { href: "/super-admin", label: "Overview", icon: LayoutDashboard },
  { href: "/super-admin/restaurants", label: "Restaurants", icon: Building2 },
  { href: "/super-admin/billing", label: "Billing", icon: ReceiptText },
  { href: "/super-admin/onboarding", label: "Onboarding", icon: ClipboardCheck }
];

export function SuperAdminNavLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  return navItems.map((item) => {
    const Icon = item.icon;
    const active =
      item.href === "/super-admin"
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`);

    return (
      <Link
        aria-current={active ? "page" : undefined}
        className={
          mobile
            ? `focus-ring flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-bold ${
                active ? "bg-mint text-leaf" : "text-stone-600 hover:bg-mint hover:text-leaf"
              }`
            : `focus-ring flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-bold transition ${
                active
                  ? "bg-white/15 text-white"
                  : "text-white/72 hover:bg-white/10 hover:text-white"
              }`
        }
        href={item.href}
        key={item.href}
      >
        <Icon size={18} />
        {item.label}
      </Link>
    );
  });
}

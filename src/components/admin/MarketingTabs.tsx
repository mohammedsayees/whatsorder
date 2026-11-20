import Link from "next/link";
import { Gift, ImageIcon, Megaphone, Palette, QrCode, Tag, TicketPercent } from "lucide-react";

// One Marketing section: posters, poster brand look, campaigns, the QR share kit, offers, promo codes and loyalty.
const TABS = [
  { id: "posters", label: "Posters", href: "/admin/marketing", icon: ImageIcon },
  { id: "brand", label: "Brand look", href: "/admin/marketing/brand", icon: Palette },
  { id: "campaigns", label: "Campaigns", href: "/admin/campaigns/new", icon: Megaphone },
  { id: "share", label: "Share kit", href: "/admin/share", icon: QrCode },
  { id: "offers", label: "Offers", href: "/admin/marketing/offers", icon: Tag },
  { id: "promo", label: "Promo codes", href: "/admin/marketing/promo-codes", icon: TicketPercent },
  { id: "loyalty", label: "Loyalty", href: "/admin/marketing/loyalty", icon: Gift }
] as const;

export type MarketingTabId = (typeof TABS)[number]["id"];

export function MarketingTabs({ active, canEditLoyalty }: { active: MarketingTabId; canEditLoyalty: boolean }) {
  return (
    <nav aria-label="Marketing" className="flex gap-2 overflow-x-auto border-b border-stone-200 pb-2">
      {TABS.filter((tab) => tab.id !== "loyalty" || canEditLoyalty).map((tab) => {
        const Icon = tab.icon;
        const current = tab.id === active;
        return (
          <Link
            aria-current={current ? "page" : undefined}
            className={`focus-ring inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-black ${
              current ? "bg-mint text-leaf" : "text-stone-600 hover:bg-stone-100 hover:text-ink"
            }`}
            href={tab.href}
            key={tab.id}
          >
            <Icon size={16} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

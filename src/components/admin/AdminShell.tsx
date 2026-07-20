import Link from "next/link";
import {
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  LogOut,
  Megaphone,
  MenuSquare,
  MessagesSquare,
  MessageSquareText,
  PieChart,
  Settings,
  Users,
  WalletCards
} from "lucide-react";
import { logoutRestaurantAdminAction } from "@/app/admin-login/actions";
import { AdminAlertsProvider } from "@/components/admin/AdminAlertsProvider";
import { BillingBanner } from "@/components/admin/BillingBanner";
import { ChatUnreadNavBadge } from "@/components/admin/ChatUnreadNavBadge";
import type { SubscriptionStatus } from "@/lib/billing";
import type { NewOrderAlertState } from "@/lib/data";
import type { RestaurantAdminSession } from "@/lib/super-admin-auth";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: BarChart3, staff: true },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList, staff: true },
  { href: "/admin/shifts", label: "Shifts", icon: WalletCards, staff: true },
  { href: "/admin/menu", label: "Menu", icon: MenuSquare, staff: true },
  { href: "/admin/customers", label: "Customers", icon: Users, staff: false },
  { href: "/admin/chats", label: "Chats", icon: MessagesSquare, staff: false },
  { href: "/admin/jobs", label: "Team · Jobs", icon: BriefcaseBusiness, staff: false },
  { href: "/admin/marketing", label: "Marketing", icon: Megaphone, staff: false },
  { href: "/admin/reports", label: "Reports", icon: PieChart, staff: false },
  { href: "/admin/feedback", label: "Feedback", icon: MessageSquareText, staff: false },
  { href: "/admin/settings", label: "Settings", icon: Settings, staff: false }
];

export function AdminShell({
  children,
  billingStatus,
  initialUnreadChatConversationIds,
  initialNewOrderAlertState,
  realtimeAccessToken,
  session
}: {
  children: React.ReactNode;
  billingStatus?: SubscriptionStatus | null;
  initialUnreadChatConversationIds: string[];
  initialNewOrderAlertState: NewOrderAlertState;
  realtimeAccessToken: string | null;
  session: RestaurantAdminSession;
}) {
  return (
    <div className="min-h-screen bg-stone-50">
      <aside className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white print:hidden lg:inset-y-0 lg:left-0 lg:right-auto lg:w-64 lg:border-r lg:border-t-0">
        <div className="hidden px-6 py-6 lg:block">
          <Link className="text-xl font-black text-ink" href="/admin">
            WhatsOrder
          </Link>
          <p className="mt-1 truncate text-sm font-bold text-stone-700">{session.restaurant.name}</p>
          <p className="mt-0.5 text-xs capitalize text-stone-500">{session.role.replace("_", " ")}</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto p-2 lg:block lg:space-y-1 lg:overflow-visible lg:px-3">
          {navItems.filter((item) => session.role !== "staff" || item.staff).map((item) => {
            const Icon = item.icon;

            return (
              <Link
                className="focus-ring relative flex min-w-20 shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-bold text-stone-600 hover:bg-mint hover:text-leaf lg:min-w-0 lg:w-full lg:flex-row lg:px-3 lg:py-3 lg:text-sm"
                href={item.href}
                key={item.href}
              >
                <Icon size={18} />
                {item.label}
                {item.href === "/admin/chats" ? (
                  <ChatUnreadNavBadge
                    initialUnreadConversationIds={initialUnreadChatConversationIds}
                    realtimeAccessToken={realtimeAccessToken}
                    restaurantId={session.restaurantId}
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>
        <form action={logoutRestaurantAdminAction} className="hidden px-3 pb-4 lg:block">
          <p className="mb-3 truncate px-3 text-xs font-semibold text-stone-400">{session.email}</p>
          <button className="focus-ring flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-stone-500 hover:bg-stone-100" type="submit">
            <LogOut size={17} />
            Sign out
          </button>
        </form>
      </aside>
      <div className="pb-24 print:pb-0 lg:pb-0 lg:pl-64 lg:print:pl-0">
        <AdminAlertsProvider
          initialNewOrderAlertState={initialNewOrderAlertState}
          realtimeAccessToken={realtimeAccessToken}
          restaurantId={session.restaurantId}
        >
          <BillingBanner status={billingStatus ?? null} />
          {children}
        </AdminAlertsProvider>
      </div>
    </div>
  );
}

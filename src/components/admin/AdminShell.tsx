import Link from "next/link";
import {
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  CreditCard,
  LogOut,
  Landmark,
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
import { AdminShellFrame } from "@/components/admin/AdminShellFrame";
import { ChatUnreadNavBadge } from "@/components/admin/ChatUnreadNavBadge";
import { WhatsOrderBrand } from "@/components/shared/WhatsOrderBrand";
import type { SubscriptionStatus } from "@/lib/billing";
import type { NewOrderAlertState } from "@/lib/data";
import type { RestaurantAdminSession } from "@/lib/super-admin-auth";
import { isGuidedAdminSetup } from "@/lib/admin-shell";
import { BILLING_PAGE_HREF, canViewBilling } from "@/lib/owner-billing";

const setupNavHrefs = new Set([
  "/admin",
  "/admin/orders",
  "/admin/menu",
  "/admin/settings"
]);

const navItems = [
  { href: "/admin", label: "Dashboard", icon: BarChart3, staff: true },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList, staff: true },
  { href: "/admin/shifts", label: "Shifts", icon: WalletCards, staff: true },
  { href: "/admin/menu", label: "Menu", icon: MenuSquare, staff: true },
  { href: "/admin/customers", label: "Customers", icon: Users, staff: false },
  { href: "/admin/chats", label: "WhatsApp", icon: MessagesSquare, staff: false },
  { href: "/admin/jobs", label: "Team · Jobs", icon: BriefcaseBusiness, staff: false },
  { href: "/admin/marketing", label: "Marketing", icon: Megaphone, staff: false },
  { href: "/admin/reports", label: "Reports", icon: PieChart, staff: false },
  { href: "/admin/finance", label: "Finance", icon: Landmark, staff: true, finance: true },
  { href: "/admin/feedback", label: "Feedback", icon: MessageSquareText, staff: false },
  { href: "/admin/settings", label: "Settings", icon: Settings, staff: false },
  // Restaurant admins/owners only (not managers or staff): see canViewBilling.
  { href: BILLING_PAGE_HREF, label: "Billing", icon: CreditCard, staff: false, billing: true }
];

export function AdminShell({
  children,
  billingStatus,
  financeVisible,
  initialUnreadChatConversationIds,
  initialNewOrderAlertState,
  realtimeAccessToken,
  session
}: {
  children: React.ReactNode;
  billingStatus?: SubscriptionStatus | null;
  financeVisible: boolean;
  initialUnreadChatConversationIds: string[];
  initialNewOrderAlertState: NewOrderAlertState;
  realtimeAccessToken: string | null;
  session: RestaurantAdminSession;
}) {
  const jobsOnly = session.restaurant.jobs_only === true;
  const guidedSetup = isGuidedAdminSetup(session.restaurant, session.role);
  const billingVisible = canViewBilling(session.role);
  const visibleNavItems = navItems.filter((item) => {
    if (jobsOnly) return item.href === "/admin/jobs";
    if (guidedSetup && !setupNavHrefs.has(item.href)) return false;
    if (item.finance && !financeVisible) return false;
    if (item.billing && !billingVisible) return false;
    return session.role !== "staff" || item.staff;
  });

  const sidebar = (
      <aside className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white print:hidden lg:inset-y-0 lg:left-0 lg:right-auto lg:flex lg:h-dvh lg:w-64 lg:flex-col lg:overflow-hidden lg:border-r lg:border-t-0">
        <div className="hidden shrink-0 px-6 py-6 lg:block">
          <Link className="text-xl font-black text-ink" href={jobsOnly ? "/admin/jobs" : "/admin"}>
            <WhatsOrderBrand imageClassName="h-10 w-10" />
          </Link>
          <p className="mt-1 truncate text-sm font-bold text-stone-700">{session.restaurant.name}</p>
          <p className="mt-0.5 text-xs capitalize text-stone-500">
            {jobsOnly
              ? "Jobs employer account"
              : guidedSetup
                ? "Setup mode · 4 essentials"
                : session.role.replace("_", " ")}
          </p>
        </div>
        <nav
          aria-label="Admin navigation"
          className="flex max-w-full snap-x gap-1 overflow-x-auto overscroll-x-contain p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] [scrollbar-width:thin] lg:min-h-0 lg:flex-1 lg:snap-none lg:block lg:space-y-1 lg:overflow-x-hidden lg:overflow-y-auto lg:overscroll-y-contain lg:px-3 lg:pb-4 lg:[scrollbar-gutter:stable]"
        >
          {visibleNavItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                className="focus-ring relative flex min-w-20 shrink-0 snap-start flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-bold text-stone-600 hover:bg-mint hover:text-leaf lg:min-w-0 lg:w-full lg:flex-row lg:px-3 lg:py-3 lg:text-sm"
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
        <form action={logoutRestaurantAdminAction} className="hidden shrink-0 border-t border-stone-100 bg-white px-3 py-4 lg:block">
          <p className="mb-3 truncate px-3 text-xs font-semibold text-stone-400">{session.email}</p>
          <button className="focus-ring flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-stone-500 hover:bg-stone-100" type="submit">
            <LogOut size={17} />
            Sign out
          </button>
        </form>
      </aside>
  );

  return (
    <AdminShellFrame
      billingHref={billingVisible ? BILLING_PAGE_HREF : null}
      billingStatus={billingStatus}
      initialNewOrderAlertState={initialNewOrderAlertState}
      jobsOnly={jobsOnly}
      realtimeAccessToken={realtimeAccessToken}
      restaurantId={session.restaurantId}
      sidebar={sidebar}
    >
      {children}
    </AdminShellFrame>
  );
}

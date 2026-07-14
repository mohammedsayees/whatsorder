import { Clock3, MapPin, MessageCircle, Megaphone, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoyaltyRedeemButton } from "@/components/admin/LoyaltyRedeemButton";
import { CustomerSearchForm } from "@/components/admin/CustomerSearchForm";
import { PaginationNav } from "@/components/admin/PaginationNav";
import { WithdrawMarketingConsentButton } from "@/components/admin/WithdrawMarketingConsentButton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatAED } from "@/lib/currency";
import { formatUaeDate, formatUaeDateTime } from "@/lib/date-time";
import {
  getCustomerInsights,
  getFulfilmentLabel,
  isSegmentFilter,
  SEGMENT_TABS,
  type CustomerSegment,
  type CustomerSegmentFilter
} from "@/lib/customer-insights";
import { getCustomerSegments, getOrdersForCustomerPhones } from "@/lib/data";
import { requireRestaurantRole } from "@/lib/super-admin-auth";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

function positivePage(value?: string) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

const segmentClasses: Record<CustomerSegment, string> = {
  New: "bg-stone-100 text-stone-600",
  Repeat: "bg-mint/20 text-leaf",
  VIP: "bg-amber-100 text-amber-800",
  Inactive: "bg-rose-50 text-rose-700"
};

function publicAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  if (configured) {
    return configured;
  }

  const vercelUrl =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

  return vercelUrl ? `https://${vercelUrl}` : "http://localhost:3000";
}

export default async function AdminCustomersPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string; segment?: string; q?: string }>;
}) {
  const { restaurant } = await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);
  const appUrl = publicAppUrl();
  const query = await searchParams;
  const activeSegment: CustomerSegmentFilter = isSegmentFilter(query.segment)
    ? query.segment
    : "all";
  const searchTerm = query.q?.trim() ?? "";
  const requestedPage = positivePage(query.page);

  // Dine-in tab only when the restaurant actually supports dine-in.
  const visibleTabs = SEGMENT_TABS.filter(
    (tab) => !tab.requiresDineIn || restaurant.dine_in_enabled === true
  );

  const segmentPage = await getCustomerSegments(restaurant.id, {
    segment: activeSegment,
    search: searchTerm,
    page: requestedPage,
    pageSize: 25
  });

  const segmentQuery = new URLSearchParams({ segment: activeSegment });
  if (searchTerm) {
    segmentQuery.set("q", searchTerm);
  }

  if (segmentPage.totalPages > 0 && segmentPage.page > segmentPage.totalPages) {
    redirect(
      `/admin/customers?${segmentQuery.toString()}&page=${segmentPage.totalPages}`
    );
  }

  const orders = await getOrdersForCustomerPhones(
    restaurant.id,
    segmentPage.items.map((customer) => customer.phone)
  );

  const activeTab = visibleTabs.find((tab) => tab.value === activeSegment);
  const summaryCards = [
    { label: "Total customers", value: segmentPage.summary.total },
    { label: "Repeat customers", value: segmentPage.summary.repeat },
    { label: "VIP customers", value: segmentPage.summary.vip },
    { label: "Inactive customers", value: segmentPage.summary.inactive },
    { label: "Can contact on WhatsApp", value: segmentPage.summary.marketing_opt_in },
    { label: "Contactable in this filter", value: segmentPage.contactable }
  ];
  const campaignHref = `/admin/campaigns/new?${segmentQuery.toString()}`;
  const canStartCampaign = segmentPage.contactable > 0;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-black">Customers</h1>
      <p className="mt-2 text-stone-600">
        Customer history is captured from checkout, including marketing consent.
      </p>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {summaryCards.map((card) => (
          <div className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm" key={card.label}>
            <p className="text-xs font-semibold text-stone-500">{card.label}</p>
            <p className="mt-1 text-2xl font-black">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Customer segments">
          {visibleTabs.map((tab) => (
            <Link
              aria-current={activeSegment === tab.value ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-black ${
                activeSegment === tab.value
                  ? "bg-ink text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
              href={`/admin/customers?segment=${tab.value}${searchTerm ? `&q=${encodeURIComponent(searchTerm)}` : ""}`}
              key={tab.value}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <CustomerSearchForm query={searchTerm} segment={activeSegment} />
      </section>

      <section className="mt-4 rounded-lg border border-leaf/30 bg-mint/10 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-ink">
              {segmentPage.matched} customer{segmentPage.matched === 1 ? "" : "s"} match this
              segment
            </p>
            <p className="mt-0.5 text-sm font-semibold text-leaf">
              {segmentPage.contactable} can be contacted on WhatsApp
            </p>
            {activeTab?.hint ? (
              <p className="mt-1 text-xs text-stone-500">{activeTab.hint}</p>
            ) : null}
          </div>
          {canStartCampaign ? (
            <Link
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-leaf px-4 py-3 text-sm font-black text-white"
              href={campaignHref}
            >
              <Megaphone size={17} />
              Create campaign from this segment
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-stone-100 px-4 py-3 text-sm font-black text-stone-400"
              title="No customers in this segment can be contacted on WhatsApp yet."
            >
              <Megaphone size={17} />
              Create campaign from this segment
            </span>
          )}
        </div>
        {!canStartCampaign ? (
          <p className="mt-2 text-xs text-stone-500">
            No one in this segment has opted in to marketing yet, so there is no one to message.
          </p>
        ) : null}
      </section>

      <div className="mt-6 grid gap-4">
        {segmentPage.items.map((customer) => {
          const history = orders.filter((order) => order.customer_phone === customer.phone);
          const insights = getCustomerInsights(history);
          const hasMarketingConsent =
            customer.marketing_opt_in && customer.consent_marketing;
          const loyaltyEnabled = restaurant.loyalty_enabled !== false;
          const stampsRequired = restaurant.loyalty_stamps_required ?? 10;
          const rewardDescription = restaurant.loyalty_reward_description ?? "reward";
          const rewardReady =
            loyaltyEnabled && customer.loyalty_points_balance >= stampsRequired;
          const mostOrderedItem = insights.mostOrderedItems[0];
          const marketingMessage = [
            `Hi ${customer.name}, this is ${restaurant.name}.`,
            mostOrderedItem
              ? `We would love to welcome you back for your frequently ordered ${mostOrderedItem.name}.`
              : "We would love to welcome you back for another order.",
            `View our menu: ${appUrl}/r/${restaurant.slug}`,
            "Reply STOP if you prefer not to receive promotional messages."
          ].join("\n\n");

          return (
            <article className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm" key={customer.id}>
              <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black">{customer.name}</h2>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-black ${segmentClasses[insights.segment]}`}
                    >
                      {insights.segment} customer
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-stone-500">{customer.phone}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div className="rounded-lg bg-stone-50 p-3">
                      <p className="text-stone-500">Completed orders</p>
                      <p className="text-xl font-black">{insights.completedOrderCount}</p>
                    </div>
                    <div className="rounded-lg bg-stone-50 p-3">
                      <p className="text-stone-500">Completed spend</p>
                      <p className="text-xl font-black">{formatAED(insights.completedSpend)}</p>
                    </div>
                    <div className="rounded-lg bg-stone-50 p-3">
                      <p className="text-stone-500">Average order</p>
                      <p className="text-xl font-black">{formatAED(insights.averageOrderValue)}</p>
                    </div>
                    <div className="rounded-lg bg-stone-50 p-3">
                      <p className="text-stone-500">Loyalty stamps</p>
                      <p className="text-xl font-black text-leaf">
                        {customer.loyalty_points_balance}
                        {loyaltyEnabled ? (
                          <span className="text-sm font-bold text-stone-400"> / {stampsRequired}</span>
                        ) : null}
                      </p>
                    </div>
                    <div className="rounded-lg bg-stone-50 p-3">
                      <p className="text-stone-500">Last completed</p>
                      <p className="font-bold">
                        {insights.lastCompletedOrderAt
                          ? formatUaeDate(insights.lastCompletedOrderAt)
                          : "Not recorded"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-stone-50 p-3">
                      <p className="text-stone-500">Preferred service</p>
                      <p className="font-bold">
                        {getFulfilmentLabel(insights.preferredFulfilment)}
                      </p>
                    </div>
                  </div>

                  {rewardReady ? (
                    <div className="mt-4 rounded-lg border border-leaf/30 bg-mint/10 p-3">
                      <p className="text-sm font-black text-leaf">
                        Reward ready: {rewardDescription}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        {customer.loyalty_points_balance} of {stampsRequired} stamps collected.
                        Redeeming clears one full card.
                      </p>
                      <LoyaltyRedeemButton
                        customerId={customer.id}
                        customerName={customer.name}
                        rewardDescription={rewardDescription}
                      />
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="text-amber-700" size={18} />
                      <h3 className="font-black text-amber-950">Customer insights</h3>
                    </div>
                    {insights.mostOrderedItems.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {insights.mostOrderedItems.map((item, index) => (
                          <div
                            className="flex items-center justify-between gap-3 rounded-lg bg-white/80 px-3 py-2 text-sm"
                            key={item.itemId}
                          >
                            <div>
                              <p className="font-black text-stone-800">
                                {index === 0 ? "Most ordered: " : ""}
                                {item.name}
                              </p>
                              <p className="text-xs text-stone-500">
                                Ordered in {item.orderCount} completed orders · {item.quantity} total
                              </p>
                            </div>
                            {index === 0 ? (
                              <TrendingUp className="shrink-0 text-amber-700" size={18} />
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-amber-900">
                        Most ordered products appear after the same item is included in at least two
                        completed orders.
                      </p>
                    )}
                    <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-stone-600">
                      <Clock3 size={15} />
                      {insights.daysSinceLastOrder === null
                        ? "No completed order yet"
                        : insights.daysSinceLastOrder === 0
                          ? "Last completed order was today"
                          : `${insights.daysSinceLastOrder} days since the last completed order`}
                    </p>
                  </div>

                  <div
                    className={`mt-4 rounded-lg border p-3 ${
                      hasMarketingConsent
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-stone-200 bg-stone-50"
                    }`}
                  >
                    <p
                      className={`text-sm font-black ${
                        hasMarketingConsent ? "text-emerald-800" : "text-stone-600"
                      }`}
                    >
                      {hasMarketingConsent
                        ? "Marketing consent recorded"
                        : "No marketing consent"}
                    </p>
                    {hasMarketingConsent ? (
                      <>
                        <a
                          className="focus-ring mt-3 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-black text-white"
                          href={buildWhatsAppUrl(customer.phone, marketingMessage)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <MessageCircle size={17} />
                          Send WhatsApp
                        </a>
                        <WithdrawMarketingConsentButton
                          customerId={customer.id}
                          customerName={customer.name}
                        />
                      </>
                    ) : (
                      <p className="mt-1 text-xs leading-5 text-stone-500">
                        Promotional WhatsApp actions stay disabled unless the customer explicitly
                        opted in.
                      </p>
                    )}
                  </div>

                  <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
                    <p>
                      <span className="font-bold text-stone-800">Area:</span> {customer.delivery_area}
                    </p>
                    <p className="mt-1">
                      <span className="font-bold text-stone-800">Address:</span> {customer.delivery_address}
                    </p>
                    <p className="mt-1">
                      <span className="font-bold text-stone-800">Landmark:</span>{" "}
                      {customer.default_landmark || "Not provided"}
                    </p>
                    {customer.default_google_maps_url ? (
                      <a
                        className="focus-ring mt-3 inline-flex items-center gap-2 rounded-full bg-leaf px-3 py-2 text-xs font-black text-white"
                        href={customer.default_google_maps_url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <MapPin size={14} />
                        Open in Google Maps
                      </a>
                    ) : null}
                  </div>
                  <p className="mt-3 text-xs font-semibold text-stone-500">
                    {customer.consent_order_processing ? "Order-processing consent saved" : "Consent not recorded"} ·{" "}
                    {hasMarketingConsent ? "Marketing opt-in" : "No marketing consent"}
                  </p>
                </div>

                <div>
                  <h3 className="font-black">Order history</h3>
                  <div className="mt-3 space-y-3">
                    {history.length > 0 ? (
                      history.map((order) => (
                        <div className="rounded-lg border border-stone-200 p-3 text-sm" key={order.id}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <StatusBadge status={order.status} />
                            <span className="font-black">{formatAED(order.total)}</span>
                          </div>
                          <p className="mt-2 text-stone-500">
                            {formatUaeDateTime(order.created_at)}
                          </p>
                          <p className="mt-2 text-stone-700">
                            {order.items.map((item) => `${item.quantity}x ${item.name}`).join(", ")}
                          </p>
                          {Number(order.points_earned ?? 0) > 0 ? (
                            <p className="mt-2 font-bold text-leaf">{order.points_earned} points earned</p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <p className="rounded-lg bg-stone-50 p-3 text-sm text-stone-500">No orders found.</p>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
        {segmentPage.items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white px-5 py-14 text-center">
            <p className="font-black">No customers found</p>
            <p className="mt-1 text-sm text-stone-500">
              {searchTerm || activeSegment !== "all"
                ? "No customers match this segment or search. Try a different filter."
                : "Customer profiles will appear after orders are placed."}
            </p>
          </div>
        ) : null}
      </div>

      <PaginationNav
        basePath="/admin/customers"
        page={segmentPage.page}
        pageSize={segmentPage.pageSize}
        query={{ segment: activeSegment, q: searchTerm || undefined }}
        total={segmentPage.matched}
        totalPages={segmentPage.totalPages}
      />

      <p className="mt-5 text-sm leading-6 text-stone-500">
        Segments use completed orders only. Current defaults: VIP after five completed orders or AED
        250 completed spend; inactive after 30 days. WhatsApp remains manual and is available only
        when marketing consent is recorded.
      </p>
    </main>
  );
}

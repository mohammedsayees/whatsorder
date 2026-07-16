import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Circle,
  ClipboardList,
  Mail,
  ShoppingBag,
  UserPlus,
  Users
} from "lucide-react";
import {
  inviteRestaurantOwnerAction,
  inviteRestaurantUserAction,
  promoteDemoRestaurantAction,
  toggleOnboardingTaskAction,
  updateRestaurantNotesAction,
  updateSuperAdminRestaurantAction
} from "@/app/super-admin/actions";
import { QrCodePanel } from "@/components/super-admin/QrCodePanel";
import { RestaurantPlanBadge, RestaurantStatusBadge } from "@/components/super-admin/RestaurantBadge";
import { RestaurantForm } from "@/components/super-admin/RestaurantForm";
import { RevokeTeamAccessButton } from "@/components/super-admin/RevokeTeamAccessButton";
import { MenuManager } from "@/components/admin/MenuManager";
import { OffersManager } from "@/components/admin/OffersManager";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency } from "@/lib/currency";
import { formatRestaurantShortDateTime } from "@/lib/date-time";
import { getPublicAppUrl, getSuperAdminRestaurant } from "@/lib/super-admin-data";

const tabs = [
  "overview",
  "settings",
  "onboarding",
  "menu",
  "orders",
  "customers",
  "qr",
  "notes"
] as const;

type DetailTab = (typeof tabs)[number];

export default async function SuperAdminRestaurantDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    created?: string;
    saved?: string;
    error?: string;
    invited?: string;
    invite_error?: string;
    access_revoked?: string;
  }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const detail = await getSuperAdminRestaurant(id);

  if (!detail) {
    notFound();
  }

  const activeTab = tabs.includes(query.tab as DetailTab) ? (query.tab as DetailTab) : "overview";
  const {
    restaurant,
    onboardingTasks,
    categories,
    items,
    offers,
    orders,
    customers,
    ownerMembership,
    teamMemberships
  } = detail;
  const formatDate = (value: string | null | undefined) =>
    value ? formatRestaurantShortDateTime(value, restaurant) : "Not available";
  const menuUrl = `${getPublicAppUrl()}/r/${restaurant.slug}`;
  const onboardingPercent =
    restaurant.onboarding_total > 0
      ? Math.round((restaurant.onboarding_completed / restaurant.onboarding_total) * 100)
      : 0;
  const overviewCards = [
    { label: "Total orders", value: restaurant.orders_count, icon: ShoppingBag },
    { label: "Customers", value: restaurant.customers_count, icon: Users },
    {
      label: "Last order",
      value: restaurant.last_order_at ? formatDate(restaurant.last_order_at) : "No orders",
      icon: ClipboardList
    },
    { label: "Onboarding", value: `${onboardingPercent}%`, icon: Check }
  ];

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <Link className="inline-flex items-center gap-2 text-sm font-black text-stone-600" href="/super-admin/restaurants">
        <ArrowLeft size={17} />
        Restaurants
      </Link>

      <header className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <RestaurantStatusBadge status={restaurant.status ?? "draft"} />
            <RestaurantPlanBadge plan={restaurant.plan ?? "trial"} />
            {restaurant.is_demo ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-amber-800">
                Demo store
              </span>
            ) : null}
          </div>
          <h1 className="mt-3 text-3xl font-black">{restaurant.name}</h1>
          <p className="mt-1 text-stone-500">/r/{restaurant.slug} · {restaurant.city || "City not set"}</p>
        </div>
        <a
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-black text-white"
          href={menuUrl}
          rel="noreferrer"
          target="_blank"
        >
          Open public menu
          <ArrowUpRight size={17} />
        </a>
      </header>

      {query.created ? (
        <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          Restaurant created successfully. Public menu:{" "}
          <a className="underline" href={menuUrl} rel="noreferrer" target="_blank">
            {menuUrl}
          </a>
        </p>
      ) : null}
      {query.saved ? (
        <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          Changes saved successfully.
        </p>
      ) : null}
      {query.error ? (
        <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {query.error}
        </p>
      ) : null}
      {query.invited ? (
        <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          {query.invited}
        </p>
      ) : null}
      {query.invite_error ? (
        <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          Owner invitation failed: {query.invite_error}
        </p>
      ) : null}
      {query.access_revoked ? (
        <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          {query.access_revoked}
        </p>
      ) : null}

      {restaurant.is_demo ? (
        <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-lg font-black text-amber-900">Promote this demo to a real restaurant</h2>
          <p className="mt-1 text-sm text-amber-800">
            Keeps the same link, menu, and order history. Test orders currently go to the
            WhatsOrder number — enter the restaurant&apos;s real WhatsApp number to take over.
            {restaurant.owner_phone ? (
              <>
                {" "}
                Owner&apos;s WhatsApp from the funnel: <b>{restaurant.owner_phone}</b>
              </>
            ) : null}
          </p>
          <form action={promoteDemoRestaurantAction} className="mt-4 flex flex-wrap items-center gap-3">
            <input name="restaurant_id" type="hidden" value={restaurant.id} />
            <input
              className="focus-ring w-64 rounded-lg border border-amber-300 bg-white px-4 py-3 text-sm"
              defaultValue={restaurant.owner_phone ?? ""}
              name="whatsapp_number"
              placeholder="Restaurant WhatsApp number"
              required
              type="tel"
            />
            <button
              className="focus-ring rounded-lg bg-amber-600 px-4 py-3 text-sm font-black text-white hover:bg-amber-500"
              type="submit"
            >
              Promote to real restaurant
            </button>
          </form>
        </section>
      ) : null}

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-stone-200">
        {tabs.map((tab) => (
          <Link
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-black capitalize ${
              activeTab === tab
                ? "border-leaf text-leaf"
                : "border-transparent text-stone-500 hover:text-ink"
            }`}
            href={`/super-admin/restaurants/${restaurant.id}?tab=${tab}`}
            key={tab}
          >
            {tab === "qr" ? "QR code" : tab}
          </Link>
        ))}
      </nav>

      <section className="mt-6">
        {activeTab === "overview" ? (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {overviewCards.map((card) => {
                const Icon = card.icon;

                return (
                <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm" key={card.label}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-stone-500">{card.label}</p>
                    <Icon className="text-leaf" size={18} />
                  </div>
                  <p className="mt-3 text-2xl font-black">{card.value}</p>
                </article>
                );
              })}
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black">Restaurant profile</h2>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  {[
                    ["Owner", restaurant.owner_name || "Not set"],
                    ["Owner email", restaurant.owner_email || "Not set"],
                    ["Owner phone", restaurant.owner_phone || "Not set"],
                    ["WhatsApp", restaurant.whatsapp_number],
                    ["Address", restaurant.address || "Not set"],
                    ["City", restaurant.city || "Not set"],
                    ["Cuisine", restaurant.subtitle || "Not set"],
                    ["Created", formatDate(restaurant.created_at)]
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs font-black uppercase text-stone-400">{label}</dt>
                      <dd className="mt-1 text-sm font-bold text-stone-700">{value}</dd>
                    </div>
                  ))}
                </dl>
              </article>

              <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-black">Onboarding progress</h2>
                  <Link className="text-sm font-black text-leaf" href={`?tab=onboarding`}>
                    Manage
                  </Link>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm font-bold">
                  <span>{restaurant.onboarding_completed} of {restaurant.onboarding_total} complete</span>
                  <span>{onboardingPercent}%</span>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full rounded-full bg-leaf" style={{ width: `${onboardingPercent}%` }} />
                </div>
                <div className="mt-5 space-y-3">
                  {onboardingTasks.slice(0, 5).map((task) => (
                    <div className="flex items-center gap-3 text-sm" key={task.id}>
                      {task.is_completed ? (
                        <Check className="text-leaf" size={17} />
                      ) : (
                        <Circle className="text-stone-300" size={17} />
                      )}
                      <span className={task.is_completed ? "font-bold" : "text-stone-500"}>{task.task_label}</span>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Mail className="text-leaf" size={18} />
                    <h2 className="text-lg font-black">Restaurant owner access</h2>
                  </div>
                  <p className="mt-2 text-sm text-stone-500">
                    {ownerMembership?.accepted_at
                      ? `${ownerMembership.email} has activated access to this restaurant.`
                      : ownerMembership?.user_id
                        ? `${ownerMembership.email} is linked and awaiting activation.`
                      : restaurant.owner_email
                        ? `${restaurant.owner_email} has not activated an account yet.`
                        : "Add an owner email in Settings before sending an invitation."}
                  </p>
                  {ownerMembership?.invited_at ? (
                    <p className="mt-1 text-xs font-semibold text-stone-400">
                      Last invitation: {formatDate(ownerMembership.invited_at)}
                    </p>
                  ) : null}
                </div>
                {restaurant.owner_email ? (
                  <form action={inviteRestaurantOwnerAction}>
                    <input name="restaurant_id" type="hidden" value={restaurant.id} />
                    <input name="owner_email" type="hidden" value={restaurant.owner_email} />
                    <button
                      className="focus-ring rounded-lg bg-leaf px-4 py-3 text-sm font-black text-white"
                      type="submit"
                    >
                      {ownerMembership?.invited_at ? "Invite / relink owner" : "Invite owner"}
                    </button>
                  </form>
                ) : (
                  <Link
                    className="rounded-lg border border-stone-200 px-4 py-3 text-sm font-black"
                    href={`?tab=settings`}
                  >
                    Add owner email
                  </Link>
                )}
              </div>
            </article>

            <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <UserPlus className="text-leaf" size={18} />
                <h2 className="text-lg font-black">Team access</h2>
              </div>
              <p className="mt-2 text-sm text-stone-500">
                Invite a manager or staff member. Each person receives their own credentials and is
                restricted to this restaurant.
              </p>
              <form
                action={inviteRestaurantUserAction}
                className="mt-5 grid gap-3 sm:grid-cols-[1fr_180px_auto]"
              >
                <input name="restaurant_id" type="hidden" value={restaurant.id} />
                <input
                  className="focus-ring rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
                  name="email"
                  placeholder="team.member@example.com"
                  required
                  type="email"
                />
                <select
                  className="focus-ring rounded-lg border border-stone-200 px-3 py-2.5 text-sm font-bold"
                  defaultValue="staff"
                  name="role"
                >
                  <option value="manager">Manager</option>
                  <option value="staff">Staff</option>
                </select>
                <button
                  className="focus-ring rounded-lg bg-ink px-4 py-2.5 text-sm font-black text-white"
                  type="submit"
                >
                  Send invite
                </button>
              </form>

              <div className="mt-5 divide-y divide-stone-100 rounded-lg border border-stone-200">
                {teamMemberships.map((membership) => (
                  <div
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    key={membership.id}
                  >
                    <div>
                      <p className="text-sm font-black">{membership.email}</p>
                      <p className="mt-0.5 text-xs capitalize text-stone-500">
                        {membership.role.replace("_", " ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`w-fit rounded-full px-2.5 py-1 text-xs font-black ${
                          membership.accepted_at
                            ? "bg-emerald-50 text-emerald-700"
                            : membership.invited_at
                              ? "bg-amber-50 text-amber-800"
                              : "bg-stone-100 text-stone-600"
                        }`}
                      >
                        {membership.accepted_at
                          ? "Active"
                          : membership.invited_at
                            ? "Invitation sent"
                            : "Pending invite"}
                      </span>
                      <RevokeTeamAccessButton
                        email={membership.email}
                        membershipId={membership.id}
                        restaurantId={restaurant.id}
                      />
                    </div>
                  </div>
                ))}
                {teamMemberships.length === 0 ? (
                  <p className="px-4 py-5 text-sm font-semibold text-stone-500">
                    No restaurant users have been invited yet.
                  </p>
                ) : null}
              </div>
            </article>
          </div>
        ) : null}

        {activeTab === "settings" ? (
          <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
            <RestaurantForm action={updateSuperAdminRestaurantAction} mode="edit" restaurant={restaurant} />
          </article>
        ) : null}

        {activeTab === "onboarding" ? (
          <article className="rounded-lg border border-stone-200 bg-white shadow-sm">
            <div className="border-b border-stone-200 px-5 py-4">
              <h2 className="text-lg font-black">Onboarding checklist</h2>
              <p className="mt-1 text-sm text-stone-500">Mark operational setup items complete as the restaurant progresses.</p>
            </div>
            <div className="divide-y divide-stone-100">
              {onboardingTasks.map((task) => (
                <form
                  action={toggleOnboardingTaskAction}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                  key={task.id}
                >
                  <input name="restaurant_id" type="hidden" value={restaurant.id} />
                  <input name="task_id" type="hidden" value={task.id} />
                  <input name="is_completed" type="hidden" value={String(!task.is_completed)} />
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid h-8 w-8 place-items-center rounded-full ${
                        task.is_completed ? "bg-mint text-leaf" : "bg-stone-100 text-stone-400"
                      }`}
                    >
                      {task.is_completed ? <Check size={17} /> : <Circle size={17} />}
                    </span>
                    <div>
                      <p className="font-bold">{task.task_label}</p>
                      <p className="text-xs text-stone-500">
                        {task.completed_at ? `Completed ${formatDate(task.completed_at)}` : "Not completed"}
                      </p>
                    </div>
                  </div>
                  <button
                    className="focus-ring rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-black"
                    type="submit"
                  >
                    Mark {task.is_completed ? "incomplete" : "complete"}
                  </button>
                </form>
              ))}
            </div>
          </article>
        ) : null}

        {activeTab === "menu" ? (
          <div className="space-y-6">
            <OffersManager
              canWrite
              items={items}
              offers={offers}
              restaurant={restaurant}
              restaurantId={restaurant.id}
            />
            <MenuManager
              canWrite
              categories={categories}
              items={items}
              restaurant={restaurant}
              restaurantId={restaurant.id}
              restaurantSlug={restaurant.slug}
            />
          </div>
        ) : null}

        {activeTab === "orders" ? (
          <article className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
            <div className="border-b border-stone-200 px-5 py-4">
              <h2 className="text-lg font-black">Recent orders</h2>
            </div>
            <div className="divide-y divide-stone-100">
              {orders.slice(0, 20).map((order) => (
                <div className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center" key={order.id}>
                  <div>
                    <p className="font-black">{order.customer_name}</p>
                    <p className="text-sm text-stone-500">
                      {order.customer_phone} ·{" "}
                      {order.fulfilment_type === "car_pickup"
                        ? `Car Pickup · ${order.car_plate_number}`
                        : order.fulfilment_type === "takeaway"
                          ? "Takeaway"
                          : order.fulfilment_type === "dine_in"
                            ? `Dine In · Table ${order.table_number}`
                            : "Delivery"}{" "}
                      · {formatDate(order.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={order.status} />
                  <p className="font-black">{formatCurrency(order.total, restaurant)}</p>
                </div>
              ))}
              {orders.length === 0 ? <p className="px-5 py-12 text-center text-sm font-bold text-stone-500">No orders yet.</p> : null}
            </div>
          </article>
        ) : null}

        {activeTab === "customers" ? (
          <article className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
            <div className="border-b border-stone-200 px-5 py-4">
              <h2 className="text-lg font-black">Recent customers</h2>
            </div>
            <div className="divide-y divide-stone-100">
              {customers.slice(0, 20).map((customer) => (
                <div className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center" key={customer.id}>
                  <div>
                    <p className="font-black">{customer.name}</p>
                    <p className="text-sm text-stone-500">{customer.phone} · {customer.delivery_area}</p>
                  </div>
                  <p className="text-sm font-bold">{customer.total_orders} orders</p>
                  <p className="font-black">{formatCurrency(customer.total_spend, restaurant)}</p>
                </div>
              ))}
              {customers.length === 0 ? <p className="px-5 py-12 text-center text-sm font-bold text-stone-500">No customers yet.</p> : null}
            </div>
          </article>
        ) : null}

        {activeTab === "qr" ? (
          <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-lg font-black">Restaurant QR code</h2>
            <p className="mt-1 text-sm text-stone-500">Generate, copy, and download the restaurant&apos;s public menu QR.</p>
            <div className="mt-6">
              <QrCodePanel restaurantName={restaurant.name} url={menuUrl} />
            </div>
          </article>
        ) : null}

        {activeTab === "notes" ? (
          <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-lg font-black">Internal notes</h2>
            <p className="mt-1 text-sm text-stone-500">Private implementation, commercial, or follow-up notes.</p>
            <form action={updateRestaurantNotesAction} className="mt-5">
              <input name="restaurant_id" type="hidden" value={restaurant.id} />
              <textarea
                className="focus-ring min-h-56 w-full rounded-lg border border-stone-200 p-4"
                defaultValue={restaurant.internal_notes ?? ""}
                name="internal_notes"
                placeholder="Pilot feedback, owner requests, setup blockers, renewal notes..."
              />
              <button className="mt-4 rounded-lg bg-leaf px-5 py-3 text-sm font-black text-white" type="submit">
                Save notes
              </button>
            </form>
          </article>
        ) : null}
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Gift,
  LogOut,
  MessageCircle,
  Receipt,
  RotateCcw,
  Settings,
  ShoppingBag,
  UserRound
} from "lucide-react";
import {
  loadMoreAccountOrdersAction,
  setMarketingConsentAction,
  signOutCustomerAction,
  updateCustomerNameAction
} from "@/app/r/[restaurantSlug]/account/actions";
import { useCart } from "@/components/customer/CartProvider";
import { LanguageToggle } from "@/components/customer/LanguageToggle";
import { useCustomerLanguage } from "@/components/customer/useCustomerLanguage";
import { formatOrderItemName } from "@/lib/cart-line";
import { formatCurrency } from "@/lib/currency";
import {
  CUSTOMER_NAME_MAX_LENGTH,
  isActiveOrder,
  orderReference,
  orderSavings,
  paymentMethodKind,
  paymentState,
  reorderableLines,
  type CustomerAccount,
  type CustomerAccountOrder,
  type CustomerLoyaltyEntry,
  type PaymentMethodKind,
  type PaymentState
} from "@/lib/customer-account";
import type { CustomerLoyalty } from "@/lib/customer-auth/context";
import { getRestaurantLocalization } from "@/lib/localization";
import type { PublicRestaurant } from "@/lib/types";

type Tab = "orders" | "payments" | "rewards" | "settings";
type Translate = (en: string, ar: string) => string;

const STATUS_LABELS: Record<string, [string, string]> = {
  New: ["Sent", "تم الإرسال"],
  Accepted: ["Accepted", "تم القبول"],
  Preparing: ["Preparing", "قيد التحضير"],
  "Ready to Serve": ["Ready", "جاهز"],
  "Out for Delivery": ["On the way", "في الطريق"],
  Completed: ["Completed", "مكتمل"],
  Cancelled: ["Cancelled", "ملغي"]
};

const METHOD_LABELS: Record<PaymentMethodKind, [string, string]> = {
  cash: ["Cash", "نقداً"],
  card: ["Card on delivery", "بطاقة عند الاستلام"],
  upi: ["UPI", "UPI"],
  online: ["Paid online", "دفع إلكتروني"],
  credit: ["Account credit", "رصيد الحساب"],
  unknown: ["—", "—"]
};

const PAYMENT_LABELS: Record<PaymentState, [string, string, string]> = {
  paid: ["Paid", "مدفوع", "bg-emerald-50 text-emerald-800"],
  refunded: ["Refunded", "مسترد", "bg-sky-50 text-sky-800"],
  pending: ["Awaiting payment", "بانتظار الدفع", "bg-amber-50 text-amber-800"],
  failed: ["Payment failed", "فشل الدفع", "bg-rose-50 text-rose-800"],
  due: ["Pay on collection", "الدفع عند الاستلام", "bg-stone-100 text-stone-700"],
  on_account: ["On account", "على الحساب", "bg-stone-100 text-stone-700"],
  not_charged: ["Not charged", "لم يتم الخصم", "bg-stone-100 text-stone-500"]
};

// Goes through the ownership-checking route, which grants this browser access
// to the order's confirmation page. A plain <a> (not <Link>) so it is never
// prefetched.
function orderPageHref(restaurantSlug: string, orderId: string, isAr: boolean): string {
  return `/r/${restaurantSlug}/account/order/${orderId}${isAr ? "?lang=ar" : ""}`;
}

export function CustomerAccountView({
  account,
  loadFailed,
  restaurant,
  signInUrl
}: {
  account: CustomerAccount | null;
  loadFailed: boolean;
  restaurant: PublicRestaurant;
  signInUrl: string | null;
}) {
  const { language, setLanguage } = useCustomerLanguage();
  const isAr = language === "ar";
  const t: Translate = (en, ar) => (isAr ? ar : en);
  const restaurantName = isAr && restaurant.name_ar ? restaurant.name_ar : restaurant.name;
  const menuHref = `/r/${restaurant.slug}`;

  return (
    <div dir={isAr ? "rtl" : "ltr"} lang={isAr ? "ar" : "en"}>
      <main className="mx-auto min-h-screen w-full max-w-xl px-4 pb-16 pt-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            aria-label={t("Back to menu", "العودة إلى القائمة")}
            className="focus-ring grid h-10 w-10 place-items-center rounded-full border border-stone-200 bg-white text-ink"
            href={menuHref}
          >
            <ChevronLeft className={isAr ? "rotate-180" : ""} size={18} />
          </Link>
          <LanguageToggle language={language} setLanguage={setLanguage} />
        </div>

        <h1 className="mt-4 text-2xl font-black text-ink">{t("My account", "حسابي")}</h1>
        <p className="text-sm font-semibold text-stone-500">{restaurantName}</p>

        {account ? (
          <SignedInAccount account={account} isAr={isAr} restaurant={restaurant} t={t} />
        ) : loadFailed ? (
          <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
            {t(
              "We couldn't load your account right now. Please try again in a moment.",
              "تعذر تحميل حسابك الآن. يرجى المحاولة بعد قليل."
            )}
          </p>
        ) : (
          <SignedOut menuHref={menuHref} restaurantName={restaurantName} signInUrl={signInUrl} t={t} />
        )}
      </main>
    </div>
  );
}

function SignedOut({
  menuHref,
  restaurantName,
  signInUrl,
  t
}: {
  menuHref: string;
  restaurantName: string;
  signInUrl: string | null;
  t: Translate;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-mint text-leaf">
        <UserRound size={24} />
      </div>
      <h2 className="mt-3 text-lg font-black text-ink">
        {t("See your orders and rewards", "اطلع على طلباتك ومكافآتك")}
      </h2>
      {signInUrl ? (
        <>
          <p className="mt-1 text-sm font-semibold text-stone-600">
            {t(
              `Send ${restaurantName} a message on WhatsApp and we'll reply with your sign-in link.`,
              `أرسل رسالة إلى ${restaurantName} على واتساب وسنرد عليك برابط تسجيل الدخول.`
            )}
          </p>
          <a
            className="focus-ring mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-leaf px-5 py-3 text-sm font-black text-white"
            href={signInUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <MessageCircle size={16} />
            {t("Sign in with WhatsApp", "تسجيل الدخول عبر واتساب")}
          </a>
        </>
      ) : (
        <p className="mt-1 text-sm font-semibold text-stone-600">
          {t(
            "Open the sign-in link this café sends you on WhatsApp to see your account here.",
            "افتح رابط تسجيل الدخول الذي يرسله لك المقهى على واتساب لعرض حسابك هنا."
          )}
        </p>
      )}
      <div>
        <Link className="focus-ring mt-4 inline-block text-sm font-black text-leaf underline-offset-4 hover:underline" href={menuHref}>
          {t("Back to menu", "العودة إلى القائمة")}
        </Link>
      </div>
    </section>
  );
}

function SignedInAccount({
  account,
  isAr,
  restaurant,
  t
}: {
  account: CustomerAccount;
  isAr: boolean;
  restaurant: PublicRestaurant;
  t: Translate;
}) {
  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState(account.orders);
  const [hasMore, setHasMore] = useState(account.hasMore);
  const [loadingMore, startLoadMore] = useTransition();
  const [loadMoreError, setLoadMoreError] = useState(false);
  const localization = getRestaurantLocalization(restaurant);
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(isAr ? "ar-AE" : localization.locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: localization.time_zone
      }),
    [isAr, localization.locale, localization.time_zone]
  );
  const formatDate = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : "—");
  const money = (value: number | null | undefined) => formatCurrency(Number(value ?? 0), restaurant);
  const profile = account.profile;
  const showRewards = Boolean(account.loyalty?.enabled && (account.loyalty?.stamps_required ?? 0) > 0);

  const tabs: { id: Tab; label: string; icon: typeof Receipt }[] = [
    { id: "orders", label: t("Orders", "الطلبات"), icon: ShoppingBag },
    { id: "payments", label: t("Payments", "المدفوعات"), icon: Receipt },
    ...(showRewards ? [{ id: "rewards" as Tab, label: t("Rewards", "المكافآت"), icon: Gift }] : []),
    { id: "settings", label: t("Profile", "الملف"), icon: Settings }
  ];

  function loadMore() {
    const last = orders[orders.length - 1];
    if (!last) return;
    setLoadMoreError(false);
    startLoadMore(async () => {
      const result = await loadMoreAccountOrdersAction(restaurant.slug, last.created_at);
      if (!result.ok) {
        setLoadMoreError(true);
        return;
      }
      setOrders((current) => {
        const seen = new Set(current.map((order) => order.id));
        return [...current, ...result.orders.filter((order) => !seen.has(order.id))];
      });
      setHasMore(result.hasMore);
    });
  }

  const loadMoreControl = hasMore ? (
    <div className="mt-4 text-center">
      <button
        className="focus-ring rounded-full border border-stone-200 bg-white px-5 py-2.5 text-sm font-black text-ink disabled:opacity-60"
        disabled={loadingMore}
        onClick={loadMore}
        type="button"
      >
        {loadingMore ? t("Loading…", "جارٍ التحميل…") : t("Show older", "عرض الأقدم")}
      </button>
      {loadMoreError ? (
        <p className="mt-2 text-xs font-bold text-rose-700">
          {t("Couldn't load more. Try again.", "تعذر التحميل. حاول مرة أخرى.")}
        </p>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      <section className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label={t("Orders", "الطلبات")} value={String(profile?.total_orders ?? orders.length)} />
        <Stat label={t("Spent", "الإنفاق")} value={money(profile?.total_spend)} />
        <Stat
          label={showRewards ? t("Stamps", "الأختام") : t("Member since", "عضو منذ")}
          value={
            showRewards && account.loyalty
              ? `${account.loyalty.stamps}/${account.loyalty.stamps_required}`
              : profile?.member_since
                ? new Intl.DateTimeFormat(isAr ? "ar-AE" : localization.locale, {
                    month: "short",
                    year: "numeric",
                    timeZone: localization.time_zone
                  }).format(new Date(profile.member_since))
                : "—"
          }
        />
      </section>

      <nav
        aria-label={t("Account sections", "أقسام الحساب")}
        className="sticky top-0 z-10 -mx-4 mt-5 flex gap-1 overflow-x-auto border-b border-stone-200 bg-white px-4"
        role="tablist"
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            aria-selected={tab === id}
            className={`focus-ring inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-black transition ${
              tab === id ? "border-leaf text-leaf" : "border-transparent text-stone-500"
            }`}
            key={id}
            onClick={() => setTab(id)}
            role="tab"
            type="button"
          >
            <Icon aria-hidden size={15} />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-4">
        {tab === "orders" ? (
          <>
            {orders.length === 0 ? (
              <EmptyState
                text={t("No orders yet. Your orders will show up here.", "لا توجد طلبات بعد. ستظهر طلباتك هنا.")}
              />
            ) : (
              <ul className="space-y-3">
                {orders.map((order) => (
                  <OrderCard
                    formatDate={formatDate}
                    isAr={isAr}
                    key={order.id}
                    money={money}
                    order={order}
                    restaurantSlug={restaurant.slug}
                    t={t}
                  />
                ))}
              </ul>
            )}
            {loadMoreControl}
          </>
        ) : null}

        {tab === "payments" ? (
          <>
            {orders.length === 0 ? (
              <EmptyState text={t("No payments yet.", "لا توجد مدفوعات بعد.")} />
            ) : (
              <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
                {orders.map((order) => (
                  <PaymentRow
                    formatDate={formatDate}
                    isAr={isAr}
                    key={order.id}
                    money={money}
                    order={order}
                    restaurantSlug={restaurant.slug}
                  />
                ))}
              </ul>
            )}
            {loadMoreControl}
          </>
        ) : null}

        {tab === "rewards" && account.loyalty ? (
          <Rewards
            formatDate={formatDate}
            history={account.loyaltyHistory}
            loyalty={account.loyalty}
            t={t}
          />
        ) : null}

        {tab === "settings" ? (
          <ProfileSettings
            account={account}
            restaurantSlug={restaurant.slug}
            t={t}
          />
        ) : null}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-2 py-3">
      <p className="truncate text-base font-black text-ink">{value}</p>
      <p className="text-xs font-bold text-stone-500">{label}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm font-semibold text-stone-500">
      {text}
    </p>
  );
}

function PaymentBadge({ order, isAr }: { order: CustomerAccountOrder; isAr: boolean }) {
  const [en, ar, tone] = PAYMENT_LABELS[paymentState(order)];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${tone}`}>
      {isAr ? ar : en}
    </span>
  );
}

function OrderCard({
  formatDate,
  isAr,
  money,
  order,
  restaurantSlug,
  t
}: {
  formatDate: (iso: string | null) => string;
  isAr: boolean;
  money: (value: number | null | undefined) => string;
  order: CustomerAccountOrder;
  restaurantSlug: string;
  t: Translate;
}) {
  const cart = useCart();
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const lines = reorderableLines(order.items);
  const active = isActiveOrder(order.status);
  const [statusEn, statusAr] = STATUS_LABELS[order.status] ?? [order.status, order.status];
  const savings = orderSavings(order);
  const [methodEn, methodAr] = METHOD_LABELS[paymentMethodKind(order.payment_method)];
  const receiptHref = orderPageHref(restaurantSlug, order.id, isAr);
  const summary = lines
    .map((line) => `${line.quantity}× ${formatOrderItemName(line, isAr ? "ar" : "en")}`)
    .join(", ");

  return (
    <li className="rounded-2xl border border-stone-200 bg-white">
      <button
        aria-expanded={open}
        className="focus-ring flex w-full items-start gap-3 rounded-2xl p-4 text-start"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-black ${
                active
                  ? "bg-mint text-leaf"
                  : order.status === "Cancelled"
                    ? "bg-rose-50 text-rose-700"
                    : "bg-stone-100 text-stone-600"
              }`}
            >
              {isAr ? statusAr : statusEn}
            </span>
            <span className="text-xs font-semibold text-stone-500">{formatDate(order.created_at)}</span>
          </div>
          <p className="mt-2 line-clamp-2 text-sm font-bold text-ink">{summary || `#${orderReference(order.id)}`}</p>
        </div>
        <div className="shrink-0 text-end">
          <p className="text-sm font-black text-ink">{money(order.total)}</p>
          <ChevronDown
            aria-hidden
            className={`ms-auto mt-1 text-stone-400 transition ${open ? "rotate-180" : ""}`}
            size={16}
          />
        </div>
      </button>

      {open ? (
        <div className="border-t border-stone-100 px-4 pb-4 pt-3 text-sm">
          <p className="text-xs font-bold text-stone-500">
            {t("Order", "الطلب")} #{orderReference(order.id)}
          </p>
          <ul className="mt-2 space-y-1">
            {lines.map((line, index) => (
              <li className="flex justify-between gap-3" key={`${line.item_id}-${index}`}>
                <span className="min-w-0 text-stone-700">
                  {line.quantity}× {formatOrderItemName(line, isAr ? "ar" : "en")}
                </span>
                <span className="shrink-0 font-semibold text-stone-700">
                  {money(Number(line.price) * Number(line.quantity))}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-stone-100 pt-2 text-stone-600">
            {order.subtotal !== null ? (
              <Row label={t("Subtotal", "المجموع الفرعي")} value={money(order.subtotal)} />
            ) : null}
            {Number(order.delivery_fee ?? 0) > 0 ? (
              <Row label={t("Delivery", "التوصيل")} value={money(order.delivery_fee)} />
            ) : null}
            {savings > 0 ? (
              <Row
                label={
                  order.promo_code
                    ? `${t("Discount", "الخصم")} (${order.promo_code})`
                    : t("Discount", "الخصم")
                }
                value={`−${money(savings)}`}
              />
            ) : null}
            <Row bold label={t("Total", "الإجمالي")} value={money(order.total)} />
            <div className="flex items-center justify-between gap-3 pt-1">
              <dt>{isAr ? methodAr : methodEn}</dt>
              <dd>
                <PaymentBadge isAr={isAr} order={order} />
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            {lines.length > 0 ? (
              added ? (
                <Link
                  className="focus-ring inline-flex items-center gap-2 rounded-full bg-leaf px-4 py-2 text-sm font-black text-white"
                  href={`/r/${restaurantSlug}/checkout`}
                >
                  <Check size={15} />
                  {t("Added · Go to checkout", "تمت الإضافة · إتمام الطلب")}
                </Link>
              ) : (
                <button
                  className="focus-ring inline-flex items-center gap-2 rounded-full bg-leaf px-4 py-2 text-sm font-black text-white"
                  onClick={() => {
                    cart.addLines(lines);
                    setAdded(true);
                  }}
                  type="button"
                >
                  <RotateCcw size={15} />
                  {t("Order again", "اطلب مجدداً")}
                </button>
              )
            ) : null}
            <a
              className="focus-ring inline-flex items-center gap-2 rounded-full border border-stone-200 px-4 py-2 text-sm font-black text-ink"
              href={receiptHref}
            >
              <Receipt size={15} />
              {active ? t("Track order", "تتبع الطلب") : t("View receipt", "عرض الإيصال")}
            </a>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-black text-ink" : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PaymentRow({
  formatDate,
  isAr,
  money,
  order,
  restaurantSlug
}: {
  formatDate: (iso: string | null) => string;
  isAr: boolean;
  money: (value: number | null | undefined) => string;
  order: CustomerAccountOrder;
  restaurantSlug: string;
}) {
  const [methodEn, methodAr] = METHOD_LABELS[paymentMethodKind(order.payment_method)];
  return (
    <li>
      <a
        className="focus-ring flex items-center gap-3 px-4 py-3"
        href={orderPageHref(restaurantSlug, order.id, isAr)}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-ink">
            #{orderReference(order.id)} · {isAr ? methodAr : methodEn}
          </p>
          <p className="text-xs font-semibold text-stone-500">
            {formatDate(order.online_paid_at ?? order.created_at)}
          </p>
        </div>
        <div className="shrink-0 text-end">
          <p className="text-sm font-black text-ink">{money(order.total)}</p>
          <PaymentBadge isAr={isAr} order={order} />
        </div>
      </a>
    </li>
  );
}

function Rewards({
  formatDate,
  history,
  loyalty,
  t
}: {
  formatDate: (iso: string | null) => string;
  history: CustomerLoyaltyEntry[];
  loyalty: CustomerLoyalty;
  t: Translate;
}) {
  const required = loyalty.stamps_required ?? 0;
  const stamps = Math.max(0, loyalty.stamps);
  const ready = required > 0 && stamps >= required;
  const reward = loyalty.reward ?? t("reward", "مكافأة");
  const dots = Math.min(required, 20);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-mint bg-mint/15 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-black text-leaf">{t("Your stamp card", "بطاقة الأختام")}</h2>
          <span className="text-sm font-bold text-leaf">
            {stamps}/{required}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from({ length: dots }).map((_, index) => (
            <span
              aria-hidden
              className={`grid h-7 w-7 place-items-center rounded-full border ${
                index < stamps ? "border-leaf bg-leaf text-white" : "border-leaf/40 bg-white"
              }`}
              key={index}
            >
              {index < stamps ? <Check size={14} /> : null}
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm font-semibold text-stone-700">
          {ready
            ? t(
                `🎉 You've earned a free ${reward}! Mention it when you order.`,
                `🎉 لديك ${reward} مجاناً! اذكرها عند الطلب.`
              )
            : t(
                `${Math.max(required - stamps, 0)} more to a free ${reward}.`,
                `${Math.max(required - stamps, 0)} أختام أخرى للحصول على ${reward} مجاناً.`
              )}
        </p>
        <p className="mt-1 text-xs font-bold text-stone-500">
          {t(`${loyalty.lifetime} stamps collected in total`, `${loyalty.lifetime} ختماً إجمالاً`)}
        </p>
      </section>

      <section>
        <h2 className="text-sm font-black text-ink">{t("History", "السجل")}</h2>
        {history.length === 0 ? (
          <div className="mt-2">
            <EmptyState
              text={t(
                "You get a stamp for every completed order.",
                "تحصل على ختم مقابل كل طلب مكتمل."
              )}
            />
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
            {history.map((entry) => {
              const redeemed = entry.type === "redeemed" || entry.points < 0;
              return (
                <li className="flex items-center justify-between gap-3 px-4 py-3" key={entry.id}>
                  <div>
                    <p className="text-sm font-bold text-ink">
                      {redeemed
                        ? t("Reward redeemed", "تم استبدال المكافأة")
                        : t("Stamp earned", "تم الحصول على ختم")}
                    </p>
                    <p className="text-xs font-semibold text-stone-500">{formatDate(entry.created_at)}</p>
                  </div>
                  <span className={`text-sm font-black ${redeemed ? "text-rose-700" : "text-leaf"}`}>
                    {entry.points > 0 ? `+${entry.points}` : entry.points}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProfileSettings({
  account,
  restaurantSlug,
  t
}: {
  account: CustomerAccount;
  restaurantSlug: string;
  t: Translate;
}) {
  const router = useRouter();
  const profile = account.profile;
  const [name, setName] = useState(profile?.name ?? "");
  const [savedName, setSavedName] = useState(profile?.name ?? "");
  const [marketing, setMarketing] = useState(Boolean(profile?.consent_marketing));
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const failText = (error: string) =>
    error === "signed_out"
      ? t("You've been signed out. Please sign in again.", "تم تسجيل خروجك. يرجى تسجيل الدخول مجدداً.")
      : error === "invalid"
        ? t("Please enter a valid name.", "يرجى إدخال اسم صحيح.")
        : t("Something went wrong. Please try again.", "حدث خطأ. يرجى المحاولة مرة أخرى.");

  function saveName() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateCustomerNameAction(restaurantSlug, name);
      if (result.ok) {
        setSavedName(name.trim());
        setMessage({ tone: "ok", text: t("Name saved.", "تم حفظ الاسم.") });
      } else {
        setMessage({ tone: "error", text: failText(result.error) });
      }
    });
  }

  function toggleMarketing(next: boolean) {
    setMessage(null);
    setMarketing(next);
    startTransition(async () => {
      const result = await setMarketingConsentAction(restaurantSlug, next);
      if (!result.ok) {
        setMarketing(!next);
        setMessage({ tone: "error", text: failText(result.error) });
      }
    });
  }

  function signOut() {
    startTransition(async () => {
      await signOutCustomerAction(restaurantSlug);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <p className="text-xs font-black uppercase tracking-wide text-stone-500">
          {t("WhatsApp number", "رقم واتساب")}
        </p>
        <p className="mt-1 text-sm font-bold text-ink" dir="ltr">
          +{account.phone}
        </p>

        {profile ? (
          <>
            <label className="mt-4 block text-xs font-black uppercase tracking-wide text-stone-500" htmlFor="account-name">
              {t("Name", "الاسم")}
            </label>
            <div className="mt-1 flex gap-2">
              <input
                autoComplete="name"
                className="focus-ring min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm font-semibold text-ink"
                id="account-name"
                maxLength={CUSTOMER_NAME_MAX_LENGTH}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
              <button
                className="focus-ring rounded-xl bg-ink px-4 py-2 text-sm font-black text-white disabled:opacity-50"
                disabled={pending || !name.trim() || name.trim() === savedName}
                onClick={saveName}
                type="button"
              >
                {t("Save", "حفظ")}
              </button>
            </div>

            {profile.default_address_text || profile.delivery_address || profile.delivery_area ? (
              <>
                <p className="mt-4 text-xs font-black uppercase tracking-wide text-stone-500">
                  {t("Last delivery address", "آخر عنوان توصيل")}
                </p>
                <p className="mt-1 text-sm font-semibold text-stone-700">
                  {[
                    profile.default_address_text ?? profile.delivery_address,
                    profile.default_landmark,
                    profile.delivery_area
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </>
            ) : null}
          </>
        ) : null}
      </section>

      {profile ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <label className="flex items-start gap-3">
            <input
              checked={marketing}
              className="mt-1 h-5 w-5 accent-leaf"
              disabled={pending}
              onChange={(event) => toggleMarketing(event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="block text-sm font-black text-ink">
                {t("Offers on WhatsApp", "العروض عبر واتساب")}
              </span>
              <span className="block text-xs font-semibold text-stone-500">
                {t(
                  "Get offers and updates from this café. You'll always get messages about your orders.",
                  "استلم العروض والتحديثات من هذا المقهى. ستصلك دائماً الرسائل الخاصة بطلباتك."
                )}
              </span>
            </span>
          </label>
        </section>
      ) : null}

      {message ? (
        <p
          className={`text-sm font-bold ${message.tone === "ok" ? "text-emerald-700" : "text-rose-700"}`}
          role="status"
        >
          {message.text}
        </p>
      ) : null}

      <button
        className="focus-ring inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-black text-ink disabled:opacity-60"
        disabled={pending}
        onClick={signOut}
        type="button"
      >
        <LogOut size={15} />
        {t("Sign out", "تسجيل الخروج")}
      </button>
    </div>
  );
}

"use client";

// Office group orders (customer side). Loaded only when someone starts a
// group or opens a group link, so ordinary menu visits never download it.
//
// Everyone keeps using the normal menu and cart. In group mode the cart bar
// becomes "Add my items to the group"; the organiser then locks the group,
// everyone's items load into the organiser's normal checkout, and the kitchen
// gets a per-person breakdown in the order notes.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock, Share2, Trash2, Users, X } from "lucide-react";
import { useCart } from "@/components/customer/CartProvider";
import { formatLineOptions } from "@/lib/cart-line";
import { formatCurrency } from "@/lib/currency";
import type { CustomerLanguage } from "@/lib/customer-i18n";
import {
  GROUP_LIMITS,
  buildGroupNotes,
  groupCheckoutKey,
  groupLinePath,
  mergeGroupLines,
  normalizeParticipantName,
  type GroupLine,
  type GroupStatus
} from "@/lib/group-order";
import type { CartLine, PublicRestaurant } from "@/lib/types";

const COPY = {
  en: {
    startTitle: "Start a group order",
    startHelp:
      "Share one link with your colleagues. Everyone adds their own items, then you place one order and pay for the group.",
    yourName: "Your first name",
    namePlaceholder: "e.g. Sara",
    create: "Create group link",
    joinTitle: "Join the group order",
    joinHelp: (organiser: string) => `${organiser} is collecting orders. Add your first name, then pick your items.`,
    join: "Join",
    groupBy: (organiser: string) => `Group order by ${organiser}`,
    people: (n: number) => `${n} ${n === 1 ? "person" : "people"}`,
    items: (n: number) => `${n} ${n === 1 ? "item" : "items"}`,
    view: "View group",
    hide: "Hide",
    addMine: (n: number) => `Add my ${n} ${n === 1 ? "item" : "items"} to the group`,
    added: "Added to the group",
    share: "Share link",
    lockCheckout: "Lock & checkout",
    reopen: "Reopen the group",
    lockedGuest: (organiser: string) => `${organiser} is placing the order now.`,
    lockedOrganiser: "The group is locked. Continue to checkout or reopen it.",
    continueCheckout: "Continue to checkout",
    ordered: (organiser: string) => `${organiser} has placed the group order.`,
    expired: "This group order has expired.",
    notFound: "This group link isn't valid any more.",
    leave: "Leave group",
    empty: "Nobody has added items yet. Share the link to get started.",
    you: "you",
    remove: "Remove",
    error: "Something went wrong. Please try again.",
    shareText: (restaurant: string) => `Add your order to our ${restaurant} group order:`,
    copied: "Link copied",
    organiserPays: "You'll pay for the whole group at checkout."
  },
  ar: {
    startTitle: "ابدأ طلباً جماعياً",
    startHelp: "شارك رابطاً واحداً مع زملائك. يضيف كل شخص أصنافه، ثم تقدّم طلباً واحداً وتدفع عن المجموعة.",
    yourName: "اسمك الأول",
    namePlaceholder: "مثال: سارة",
    create: "إنشاء رابط المجموعة",
    joinTitle: "انضم إلى الطلب الجماعي",
    joinHelp: (organiser: string) => `${organiser} يجمع الطلبات. أضف اسمك الأول ثم اختر أصنافك.`,
    join: "انضمام",
    groupBy: (organiser: string) => `طلب جماعي من ${organiser}`,
    people: (n: number) => `${n} أشخاص`,
    items: (n: number) => `${n} أصناف`,
    view: "عرض المجموعة",
    hide: "إخفاء",
    addMine: (n: number) => `أضف أصنافي (${n}) إلى المجموعة`,
    added: "تمت الإضافة إلى المجموعة",
    share: "مشاركة الرابط",
    lockCheckout: "إغلاق ومتابعة الدفع",
    reopen: "إعادة فتح المجموعة",
    lockedGuest: (organiser: string) => `${organiser} يقدّم الطلب الآن.`,
    lockedOrganiser: "المجموعة مغلقة. تابع إلى الدفع أو أعد فتحها.",
    continueCheckout: "متابعة إلى الدفع",
    ordered: (organiser: string) => `قدّم ${organiser} الطلب الجماعي.`,
    expired: "انتهت صلاحية هذا الطلب الجماعي.",
    notFound: "رابط المجموعة لم يعد صالحاً.",
    leave: "مغادرة المجموعة",
    empty: "لم يضف أحد أصنافاً بعد. شارك الرابط للبدء.",
    you: "أنت",
    remove: "إزالة",
    error: "حدث خطأ. يرجى المحاولة مرة أخرى.",
    shareText: (restaurant: string) => `أضف طلبك إلى طلبنا الجماعي من ${restaurant}:`,
    copied: "تم نسخ الرابط",
    organiserPays: "ستدفع عن المجموعة كاملة عند إتمام الطلب."
  }
};

type Identity = { participantId: string; name: string; organiserToken?: string };

type GroupView = {
  status: GroupStatus | "expired";
  organiserName: string;
  restaurantId: string;
  participantCount: number;
  lines: GroupLine[];
};

const identityKey = (token: string) => `whatsorder-group-${token}`;

function readIdentity(token: string): Identity | null {
  try {
    const raw = window.localStorage.getItem(identityKey(token));
    const parsed = raw ? (JSON.parse(raw) as Identity) : null;
    return parsed?.participantId && parsed.name ? parsed : null;
  } catch {
    return null;
  }
}

function saveIdentity(token: string, identity: Identity) {
  try {
    window.localStorage.setItem(identityKey(token), JSON.stringify(identity));
  } catch {
    // In-memory identity still works for this visit.
  }
}

function newParticipantId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.padEnd(16, "0");
}

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(String(response.status));
  }

  return (await response.json()) as Record<string, unknown>;
}

async function shareGroupLink(url: string, restaurantName: string, language: CustomerLanguage) {
  const text = COPY[language].shareText(restaurantName);

  try {
    if (navigator.share) {
      await navigator.share({ text, url });
      return "shared";
    }
  } catch {
    // Dismissed: fall back to copying.
  }

  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return "copied";
  } catch {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener");
    return "shared";
  }
}

/** Sheet shown when someone taps "Start a group order" on the menu. */
export function GroupOrderStart({
  language,
  onClose,
  onCreated,
  restaurant
}: {
  language: CustomerLanguage;
  onClose: () => void;
  onCreated: (token: string) => void;
  restaurant: Pick<PublicRestaurant, "id" | "name" | "slug">;
}) {
  const copy = COPY[language];
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const create = async () => {
    const cleaned = normalizeParticipantName(name);

    if (!cleaned) {
      return;
    }

    setPending(true);
    setFailed(false);

    try {
      const created = await postJson("/api/group-orders", { restaurantId: restaurant.id, name: cleaned });
      const token = String(created.shareToken);
      saveIdentity(token, {
        participantId: newParticipantId(),
        name: cleaned,
        organiserToken: String(created.organiserToken)
      });
      onCreated(token);
      void shareGroupLink(
        `${window.location.origin}${groupLinePath(restaurant.slug, token)}`,
        restaurant.name,
        language
      );
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet onClose={onClose} title={copy.startTitle}>
      <p className="text-sm text-stone-600">{copy.startHelp}</p>
      <NameField copy={copy} name={name} onChange={setName} onSubmit={create} />
      <button
        className="focus-ring mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-leaf px-5 py-3 font-black text-white disabled:opacity-60"
        disabled={pending || !normalizeParticipantName(name)}
        onClick={create}
        type="button"
      >
        {pending ? <Loader2 className="animate-spin" size={18} /> : <Share2 size={18} />}
        {copy.create}
      </button>
      {failed ? <p className="mt-2 text-sm font-semibold text-rose-700">{copy.error}</p> : null}
    </Sheet>
  );
}

/**
 * Replaces the menu's cart bar while a group link is open: adds the visitor's
 * cart to the group, shows who ordered what, and lets the organiser lock the
 * group and continue to checkout.
 */
export function GroupOrderBar({
  checkoutHref,
  language,
  onLeave,
  restaurant,
  token
}: {
  checkoutHref: string;
  language: CustomerLanguage;
  onLeave: () => void;
  restaurant: PublicRestaurant;
  token: string;
}) {
  const copy = COPY[language];
  const cart = useCart();
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [view, setView] = useState<GroupView | null>(null);
  const [missing, setMissing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [joinName, setJoinName] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const isOrganiser = Boolean(identity?.organiserToken);

  useEffect(() => {
    setIdentity(readIdentity(token));
    setIdentityLoaded(true);
  }, [token]);

  const refresh = useCallback(async () => {
    const params = identity ? `?participant=${encodeURIComponent(identity.participantId)}` : "";

    try {
      const response = await fetch(`/api/group-orders/${encodeURIComponent(token)}${params}`, {
        cache: "no-store",
        credentials: "same-origin"
      });

      if (response.status === 404) {
        setMissing(true);
        return;
      }

      if (response.ok) {
        setView((await response.json()) as GroupView);
      }
    } catch {
      // Next tick retries.
    }
  }, [identity, token]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, 6000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 3000);
  };

  const join = () => {
    const cleaned = normalizeParticipantName(joinName);

    if (!cleaned) {
      return;
    }

    const next = { participantId: newParticipantId(), name: cleaned };
    saveIdentity(token, next);
    setIdentity(next);
  };

  const submitMyCart = async (who: Identity) => {
    if (cart.lines.length === 0) {
      return;
    }

    await postJson(`/api/group-orders/${encodeURIComponent(token)}/lines`, {
      participantId: who.participantId,
      name: who.name,
      lines: cart.lines.slice(0, GROUP_LIMITS.linesPerSubmission)
    });
    cart.clearCart();
  };

  const addMine = async () => {
    if (!identity) {
      return;
    }

    setPending(true);

    try {
      await submitMyCart(identity);
      flash(copy.added);
      await refresh();
    } catch {
      flash(copy.error);
    } finally {
      setPending(false);
    }
  };

  const remove = async (lineId: string) => {
    if (!identity) {
      return;
    }

    try {
      await postJson(`/api/group-orders/${encodeURIComponent(token)}/remove`, {
        participantId: identity.participantId,
        lineId
      });
      await refresh();
    } catch {
      flash(copy.error);
    }
  };

  const goToCheckout = (lines: { participant_name: string; line: CartLine }[]) => {
    const merged = mergeGroupLines(lines);
    cart.clearCart();
    cart.addLines(merged);

    try {
      // Write the cart directly too, so checkout reads it even if navigation
      // beats the provider's own storage effect.
      window.localStorage.setItem(`whatsorder-cart-v2-${restaurant.slug}`, JSON.stringify(merged));
      window.sessionStorage.setItem(
        groupCheckoutKey(restaurant.slug),
        JSON.stringify({
          token,
          organiserToken: identity?.organiserToken,
          notes: buildGroupNotes(lines, language),
          people: new Set(lines.map((line) => line.participant_name)).size
        })
      );
    } catch {
      // Storage blocked: the in-memory cart still carries the items.
    }

    router.push(checkoutHref);
  };

  const lockAndCheckout = async () => {
    if (!identity?.organiserToken) {
      return;
    }

    setPending(true);

    try {
      await submitMyCart(identity);
      const locked = await postJson(`/api/group-orders/${encodeURIComponent(token)}/lock`, {
        organiserToken: identity.organiserToken
      });
      goToCheckout(locked.lines as { participant_name: string; line: CartLine }[]);
    } catch {
      flash(copy.error);
      setPending(false);
    }
  };

  const reopen = async () => {
    if (!identity?.organiserToken) {
      return;
    }

    try {
      await postJson(`/api/group-orders/${encodeURIComponent(token)}/reopen`, {
        organiserToken: identity.organiserToken
      });
      await refresh();
    } catch {
      flash(copy.error);
    }
  };

  const share = async () => {
    const result = await shareGroupLink(
      `${window.location.origin}${groupLinePath(restaurant.slug, token)}`,
      restaurant.name,
      language
    );

    if (result === "copied") {
      flash(copy.copied);
    }
  };

  const lines = view?.lines ?? [];
  const itemCount = lines.reduce((sum, entry) => sum + entry.line.quantity, 0);
  const people = new Map<string, GroupLine[]>();

  for (const entry of lines) {
    const list = people.get(entry.participant_name) ?? [];
    list.push(entry);
    people.set(entry.participant_name, list);
  }

  const closedMessage = missing
    ? copy.notFound
    : view?.status === "expired"
      ? copy.expired
      : view?.status === "ordered"
        ? copy.ordered(view.organiserName)
        : null;

  if (identityLoaded && !identity && view && view.status === "open" && !missing) {
    return (
      <Sheet title={copy.joinTitle}>
        <p className="text-sm text-stone-600">{copy.joinHelp(view.organiserName)}</p>
        <NameField copy={copy} name={joinName} onChange={setJoinName} onSubmit={join} />
        <button
          className="focus-ring mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-leaf px-5 py-3 font-black text-white disabled:opacity-60"
          disabled={!normalizeParticipantName(joinName)}
          onClick={join}
          type="button"
        >
          <Users size={18} />
          {copy.join}
        </button>
        <button className="focus-ring mt-2 w-full rounded-full py-2 text-sm font-bold text-stone-500" onClick={onLeave} type="button">
          {copy.leave}
        </button>
      </Sheet>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="mx-auto max-w-3xl">
        {expanded ? (
          <div className="mb-3 max-h-[45vh] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-3">
            {people.size === 0 ? (
              <p className="text-sm text-stone-500">{copy.empty}</p>
            ) : (
              [...people.entries()].map(([name, entries]) => (
                <div className="border-b border-stone-100 py-2 last:border-b-0" key={name}>
                  <p className="text-sm font-black">
                    {name}
                    {entries.some((entry) => entry.mine) ? (
                      <span className="ms-1 font-semibold text-stone-400">({copy.you})</span>
                    ) : null}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {entries.map((entry) => {
                      const options = formatLineOptions(entry.line.options, language);
                      const itemName = language === "ar" && entry.line.name_ar ? entry.line.name_ar : entry.line.name;
                      return (
                        <li className="flex items-center justify-between gap-2 text-sm text-stone-700" key={entry.id}>
                          <span className="min-w-0">
                            {entry.line.quantity}× {itemName}
                            {options ? <span className="text-stone-500"> · {options}</span> : null}
                          </span>
                          {entry.mine && view?.status === "open" ? (
                            <button
                              aria-label={`${copy.remove} ${itemName}`}
                              className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-full text-stone-500 hover:text-rose-600"
                              onClick={() => void remove(entry.id)}
                              type="button"
                            >
                              <Trash2 size={15} />
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        ) : null}

        <div className="rounded-2xl bg-ink px-4 py-3 text-white">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/10">
              <Users size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black">{view ? copy.groupBy(view.organiserName) : "…"}</p>
              <p className="text-xs font-semibold text-white/70">
                {copy.people(view?.participantCount ?? 0)} · {copy.items(itemCount)}
              </p>
            </div>
            <button
              className="focus-ring shrink-0 rounded-full bg-white/15 px-3 py-2 text-xs font-black"
              onClick={() => setExpanded((current) => !current)}
              type="button"
            >
              {expanded ? copy.hide : copy.view}
            </button>
          </div>

          {closedMessage ? (
            <div className="mt-3 flex items-center justify-between gap-3 text-sm font-bold">
              <span className="flex items-center gap-2">
                {view?.status === "ordered" ? <Check size={16} /> : <X size={16} />}
                {closedMessage}
              </span>
              <button className="focus-ring shrink-0 rounded-full bg-white px-3 py-2 text-xs font-black text-ink" onClick={onLeave} type="button">
                {copy.leave}
              </button>
            </div>
          ) : view?.status === "locked" ? (
            isOrganiser ? (
              <div className="mt-3">
                <p className="text-xs font-semibold text-white/80">{copy.lockedOrganiser}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button className="focus-ring rounded-full bg-white/15 px-3 py-2.5 text-sm font-black" onClick={() => void reopen()} type="button">
                    {copy.reopen}
                  </button>
                  <button
                    className="focus-ring rounded-full bg-white px-3 py-2.5 text-sm font-black text-ink disabled:opacity-60"
                    disabled={pending}
                    onClick={() => void lockAndCheckout()}
                    type="button"
                  >
                    {copy.continueCheckout}
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm font-semibold text-white/85">{copy.lockedGuest(view.organiserName)}</p>
            )
          ) : (
            <div className="mt-3 space-y-2">
              {cart.count > 0 ? (
                <button
                  className="focus-ring inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-black text-ink disabled:opacity-60"
                  disabled={pending || !identity}
                  onClick={() => void addMine()}
                  type="button"
                >
                  {pending ? <Loader2 className="animate-spin" size={16} /> : <Users size={16} />}
                  {copy.addMine(cart.count)} · {formatCurrency(cart.subtotal, restaurant)}
                </button>
              ) : null}
              {isOrganiser ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-full bg-white/15 px-3 py-2.5 text-sm font-black"
                      onClick={() => void share()}
                      type="button"
                    >
                      <Share2 size={15} />
                      {copy.share}
                    </button>
                    <button
                      className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-full bg-leaf px-3 py-2.5 text-sm font-black text-white disabled:opacity-50"
                      disabled={pending || (lines.length === 0 && cart.count === 0)}
                      onClick={() => void lockAndCheckout()}
                      type="button"
                    >
                      {pending ? <Loader2 className="animate-spin" size={15} /> : <Lock size={15} />}
                      {copy.lockCheckout}
                    </button>
                  </div>
                  <p className="text-center text-[11px] font-semibold text-white/60">{copy.organiserPays}</p>
                </>
              ) : null}
            </div>
          )}

          {notice ? <p className="mt-2 text-center text-xs font-black text-mint">{notice}</p> : null}
        </div>
      </div>
    </div>
  );
}

function NameField({
  copy,
  name,
  onChange,
  onSubmit
}: {
  copy: (typeof COPY)[CustomerLanguage];
  name: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <label className="mt-4 block">
      <span className="text-sm font-bold">{copy.yourName}</span>
      <input
        autoComplete="given-name"
        autoFocus
        className="focus-ring mt-1 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base"
        maxLength={GROUP_LIMITS.nameLength}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onSubmit();
          }
        }}
        placeholder={copy.namePlaceholder}
        value={name}
      />
    </label>
  );
}

function Sheet({
  children,
  onClose,
  title
}: {
  children: React.ReactNode;
  onClose?: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full rounded-t-[28px] bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-[28px]">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <Users className="text-leaf" size={20} />
            {title}
          </h2>
          {onClose ? (
            <button aria-label="Close" className="focus-ring grid h-9 w-9 place-items-center rounded-full bg-stone-100" onClick={onClose} type="button">
              <X size={16} />
            </button>
          ) : null}
        </div>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

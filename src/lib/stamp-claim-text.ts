// lib/stamp-claim-text.ts
//
// Receipt stamp claim results and the sentence each one shows, shared by the
// stamp page, the account page (finishing a saved claim) and the WhatsApp
// sign-in reply. Pure and client-safe.

import { loyaltyRewardName } from "@/lib/loyalty-reward";

export type StampClaimError =
  | "invalid_link"
  | "signed_out"
  | "already_claimed"
  | "expired"
  | "order_cancelled"
  | "loyalty_off"
  | "failed";

export type StampClaimResult =
  | {
      ok: true;
      outcome: "stamped" | "pending" | "no_stamp" | "already";
      stamps: number;
      required: number;
      reward: string | null;
    }
  | { ok: false; error: StampClaimError };

type Translate = (en: string, ar: string) => string;

/** One sentence describing a claim result, in the customer's language. */
export function stampClaimText(result: StampClaimResult, t: Translate): string {
  if (!result.ok) {
    switch (result.error) {
      case "already_claimed":
        return t("This receipt's stamp has already been collected.", "تم جمع ختم هذا الإيصال بالفعل.");
      case "expired":
        return t("This receipt is more than 24 hours old, so its stamp can't be collected.", "مضى أكثر من 24 ساعة على هذا الإيصال، لذا لا يمكن جمع الختم.");
      case "order_cancelled":
        return t("This order was cancelled, so it has no stamp.", "تم إلغاء هذا الطلب، لذا لا يوجد ختم.");
      case "loyalty_off":
        return t("This café isn't giving stamps right now.", "هذا المقهى لا يقدم أختاماً حالياً.");
      case "invalid_link":
        return t("This stamp link isn't valid. Ask the café for help.", "رابط الختم هذا غير صالح. اطلب المساعدة من المقهى.");
      case "signed_out":
        return t("Please confirm your number on WhatsApp first.", "يرجى تأكيد رقمك عبر واتساب أولاً.");
      default:
        return t("Something went wrong. Please try again.", "حدث خطأ. يرجى المحاولة مرة أخرى.");
    }
  }
  // "Free Crunch Burger" must not read "a free Free Crunch Burger".
  const reward = loyaltyRewardName(result.reward) ?? t("reward", "مكافأة");
  const progress =
    result.required > 0
      ? result.stamps >= result.required
        ? t(`You have ${result.stamps}/${result.required}: your free ${reward} is ready!`, `لديك ${result.stamps}/${result.required}: ${reward} المجاني جاهز!`)
        : t(
            `${result.stamps}/${result.required} stamps · ${result.required - result.stamps} more for a free ${reward}.`,
            `${result.stamps}/${result.required} أختام · ${result.required - result.stamps} أخرى للحصول على ${reward} مجاناً.`
          )
      : "";
  switch (result.outcome) {
    case "stamped":
      return `${t("Stamp added!", "تمت إضافة الختم!")} ${progress}`.trim();
    case "already":
      return `${t("You've already collected this stamp.", "لقد جمعت هذا الختم بالفعل.")} ${progress}`.trim();
    case "pending":
      return t("Done! Your stamp is added as soon as your order is ready.", "تم! ستتم إضافة الختم عند تجهيز طلبك.");
    default:
      return t("Your number is saved. This order was below the minimum for a stamp.", "تم حفظ رقمك. هذا الطلب أقل من الحد الأدنى للحصول على ختم.");
  }
}

/** English line, then Arabic: for the WhatsApp reply (language unknown). */
export function stampClaimReplyText(result: StampClaimResult): string {
  return `${stampClaimText(result, (en) => en)}\n${stampClaimText(result, (_en, ar) => ar)}`;
}

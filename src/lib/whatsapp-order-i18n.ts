// Customer-facing text for WhatsApp chat ordering, in English and Arabic.
// Commands quoted in replies are ones the bot recognises in that language.
export type ChatLang = "en" | "ar";
export type ChatLanguageMode = "customer" | "english" | "arabic" | "malayalam";

const ARABIC_LETTER = /[؀-ۿ]/;
const LATIN_LETTER = /[A-Za-z]/;

/** The script a message is written in, or null when it carries no signal ("2", "👍"). */
export function detectChatLang(text: string): ChatLang | null {
  if (ARABIC_LETTER.test(text)) return "ar";
  if (LATIN_LETTER.test(text)) return "en";
  return null;
}

/**
 * Reply language. "customer" follows the script of the latest message and
 * otherwise keeps the conversation's language. Malayalam ordering replies are
 * not provided yet and fall back to English.
 */
export function resolveChatLang(mode: ChatLanguageMode | undefined, text: string, stored: ChatLang | undefined): ChatLang {
  if (mode === "arabic") return "ar";
  if (mode === "english" || mode === "malayalam") return "en";
  return detectChatLang(text) ?? stored ?? "en";
}

export type ChatError =
  | { code: "shape" }
  | { code: "quantity_whole" }
  | { code: "quantity_range" }
  | { code: "not_found"; query: string }
  | { code: "remove_ambiguous"; names: string[] }
  | { code: "set_ambiguous"; name: string }
  | { code: "cart_limit" }
  | { code: "item_unavailable" };

export type ChatCopy = {
  help: string;
  emptyOrder: string;
  noItemsOnPage: string;
  moreMenu: (page: number) => string;
  fullMenu: (link: string) => string;
  total: (amount: string) => string;
  tooLong: (link: string) => string;
  priceProblem: (detail: string) => string;
  unavailable: string;
  minimum: (amount: string) => string;
  askName: string;
  quoteHeader: (name: string) => string;
  notes: (notes: string) => string;
  quoteFooter: (restaurant: string) => string;
  handoffOrder: (orderId: string) => string;
  handoffCart: (summary: string) => string;
  alreadyReceivedYes: (orderId: string) => string;
  alreadyReceived: (orderId: string) => string;
  cleared: string;
  answerFirst: string;
  nothingPlacedYet: string;
  expired: string;
  stale: (summary: string) => string;
  pricesChanged: string;
  confirmed: (name: string, summary: string, notes: string) => string;
  didNotCatch: string;
  sendName: string;
  notFound: (what: string, link: string) => string;
  someItems: string;
  notInOrder: (name: string) => string;
  chooseItem: (lines: string) => string;
  chooseOptions: (item: string, group: string, how: string, lines: string, multi: boolean) => string;
  how: (need: number, max: number) => string;
  error: (error: ChatError) => string;
};

const NOT_CHANGED_EN = "Your order has not changed.";
const NOT_CHANGED_AR = "لم يتغير طلبك.";

export const CHAT_COPY: Record<ChatLang, ChatCopy> = {
  en: {
    help: "Order takeaway here by text: send items and quantities, e.g. “2 karak, 1 sandwich”. I'll reply with the total, then reply YES to place the order. Payment is due at collection. CART shows your order, “make it 3 karak” changes a quantity, REMOVE <item> removes an item, CLEAR empties it, STAFF gets a person.",
    emptyOrder: "Your order is empty.",
    noItemsOnPage: "No items on this page.",
    moreMenu: page => `Send MENU ${page} for more.`,
    fullMenu: link => `Full menu: ${link}`,
    total: amount => `Total: ${amount}`,
    tooLong: link => `This order or menu is too long for one message. Your order is saved. Send STAFF for help or use the full menu: ${link}`,
    priceProblem: detail => `${detail} Send REMOVE <item> to remove it, or STAFF for help.`,
    unavailable: "Takeaway ordering is unavailable right now. Please try again during opening hours, or send STAFF.",
    minimum: amount => `Minimum order is ${amount}. Add more items to continue.`,
    askName: "What name should we use for pickup?",
    quoteHeader: name => `Takeaway order for ${name}`,
    notes: notes => `Notes: ${notes}`,
    quoteFooter: restaurant => `Pay at collection; no payment has been taken.\nReply YES within 10 minutes to place this order and allow ${restaurant} to use your name and WhatsApp number to process it. No marketing opt-in. To change it, send more items, “make it 2 <item>”, REMOVE <item> or CLEAR.`,
    handoffOrder: orderId => `Submitted order: ${orderId}`,
    handoffCart: summary => `Unsent order: ${summary}`,
    alreadyReceivedYes: orderId => `Order ${orderId} was already received; no second order was placed. Send STAFF for changes, or NEW ORDER to start another order.`,
    alreadyReceived: orderId => `Order ${orderId} was already received. Send NEW ORDER to start another order, or STAFF to change this one.`,
    cleared: "Your order is cleared. No order was placed.",
    answerFirst: "Please answer this first — nothing has been ordered yet.",
    nothingPlacedYet: "Here is your order. Nothing has been placed yet.",
    expired: "That total has expired. Here is an updated one.",
    stale: summary => `That confirmation was for an earlier version of your order, so nothing was placed. Your latest order:\n${summary}\nReply YES to place it.`,
    pricesChanged: "Prices or options have changed. Please review again.",
    confirmed: (name, summary, notes) => `WhatsApp takeaway: ${name}\n${summary}${notes ? `\nNotes: ${notes}` : ""}\nPayment due at collection.`,
    didNotCatch: "Sorry, I didn't catch that.",
    sendName: "Please send the name for pickup.",
    notFound: (what, link) => `I could not find ${what} on the menu. Send MENU for item names, or STAFF for help. ${NOT_CHANGED_EN}\n${link}`,
    someItems: "some of those items",
    notInOrder: name => `${name} is not in your order. ${NOT_CHANGED_EN}`,
    chooseItem: lines => `Which one did you mean?\n${lines}\nReply with a number.`,
    chooseOptions: (item, group, how, lines, multi) => `${item} — ${group}, ${how}:\n${lines}\nReply with ${multi ? "numbers, e.g. 1,2" : "a number"}.`,
    how: (need, max) => need === max ? (need === 1 ? "choose one" : `choose ${need}`)
      : `choose ${need}${Number.isFinite(max) ? ` to ${max}` : " or more"}`,
    error: error => {
      switch (error.code) {
        case "shape": return "Send item names and quantities, for example: 2 karak, 1 sandwich.";
        case "quantity_whole": return "Please send an item name and a whole-number quantity.";
        case "quantity_range": return `Choose a quantity from 1 to 25 per item. ${NOT_CHANGED_EN}`;
        case "not_found": return `I could not find “${error.query}” on the menu. Send MENU for item names, or STAFF for help. ${NOT_CHANGED_EN}`;
        case "remove_ambiguous": return `Which item do you mean? ${error.names.join(", ")}. Send the full item name. ${NOT_CHANGED_EN}`;
        case "set_ambiguous": return `${error.name} is in your order with different options. Send REMOVE ${error.name}, then add exactly what you want. ${NOT_CHANGED_EN}`;
        case "cart_limit": return `Chat orders support up to 20 different items, 25 of each and 100 items in total. ${NOT_CHANGED_EN}`;
        case "item_unavailable": return `An item you chose is no longer available. ${NOT_CHANGED_EN}`;
      }
    }
  },
  ar: {
    help: "اطلب سفري هنا بالرسائل: أرسل الأصناف والكميات، مثل «2 كرك، 1 ساندويتش». سأرد بالإجمالي، ثم أرسل «نعم» لتأكيد الطلب. الدفع عند الاستلام. «السلة» تعرض طلبك، «خليها 3 كرك» تغيّر الكمية، «احذف» مع اسم الصنف يحذفه، «إلغاء» يفرغ الطلب، و«موظف» للتحدث مع أحد الموظفين.",
    emptyOrder: "طلبك فارغ.",
    noItemsOnPage: "لا توجد أصناف في هذه الصفحة.",
    moreMenu: page => `أرسل «منيو ${page}» للمزيد.`,
    fullMenu: link => `القائمة الكاملة: ${link}`,
    total: amount => `الإجمالي: ${amount}`,
    tooLong: link => `الطلب أو القائمة أطول من أن تُرسل في رسالة واحدة. تم حفظ طلبك. أرسل «موظف» للمساعدة أو استخدم القائمة الكاملة: ${link}`,
    // The shared price verifier reports in English; Arabic replies use a general message.
    priceProblem: () => "أحد الأصناف في طلبك تغيّر أو لم يعد متوفراً. أرسل «احذف» مع اسم الصنف لحذفه، أو «موظف» للمساعدة.",
    unavailable: "طلبات السفري غير متاحة الآن. يرجى المحاولة خلال ساعات العمل، أو أرسل «موظف».",
    minimum: amount => `الحد الأدنى للطلب ${amount}. أضف أصنافاً أخرى للمتابعة.`,
    askName: "ما الاسم الذي نستخدمه عند الاستلام؟",
    quoteHeader: name => `طلب سفري باسم ${name}`,
    notes: notes => `ملاحظات: ${notes}`,
    quoteFooter: restaurant => `الدفع عند الاستلام؛ لم يتم أخذ أي مبلغ.\nأرسل «نعم» خلال 10 دقائق لتأكيد هذا الطلب والموافقة على أن يستخدم ${restaurant} اسمك ورقم واتساب الخاص بك لتنفيذه. لا يشمل ذلك أي رسائل تسويقية. للتعديل أرسل أصنافاً أخرى، أو «خليها 2» مع اسم الصنف، أو «احذف» مع اسم الصنف، أو «إلغاء».`,
    handoffOrder: orderId => `الطلب المرسل: ${orderId}`,
    handoffCart: summary => `طلب لم يُرسل: ${summary}`,
    alreadyReceivedYes: orderId => `تم استلام الطلب ${orderId} مسبقاً، ولم يتم تسجيل طلب ثانٍ. أرسل «موظف» لأي تعديل، أو «طلب جديد» لبدء طلب آخر.`,
    alreadyReceived: orderId => `تم استلام الطلب ${orderId} مسبقاً. أرسل «طلب جديد» لبدء طلب آخر، أو «موظف» لتعديل هذا الطلب.`,
    cleared: "تم إفراغ طلبك. لم يتم تسجيل أي طلب.",
    answerFirst: "يرجى الإجابة على هذا أولاً — لم يتم تسجيل أي طلب بعد.",
    nothingPlacedYet: "هذا طلبك. لم يتم تسجيله بعد.",
    expired: "انتهت صلاحية ذلك الإجمالي. هذا إجمالي محدّث.",
    stale: summary => `ذلك التأكيد كان لنسخة سابقة من طلبك، لذلك لم يتم تسجيل أي طلب. طلبك الحالي:\n${summary}\nأرسل «نعم» لتأكيده.`,
    pricesChanged: "تغيّرت الأسعار أو الخيارات. يرجى المراجعة مرة أخرى.",
    confirmed: (name, summary, notes) => `طلب سفري عبر واتساب: ${name}\n${summary}${notes ? `\nملاحظات: ${notes}` : ""}\nالدفع عند الاستلام.`,
    didNotCatch: "عذراً، لم أفهم ذلك.",
    sendName: "يرجى إرسال الاسم للاستلام.",
    notFound: (what, link) => `لم أجد ${what} في القائمة. أرسل «منيو» لأسماء الأصناف، أو «موظف» للمساعدة. ${NOT_CHANGED_AR}\n${link}`,
    someItems: "بعض هذه الأصناف",
    notInOrder: name => `${name} ليس في طلبك. ${NOT_CHANGED_AR}`,
    chooseItem: lines => `أي صنف تقصد؟\n${lines}\nأرسل الرقم.`,
    chooseOptions: (item, group, how, lines, multi) => `${item} — ${group}، ${how}:\n${lines}\n${multi ? "أرسل الأرقام، مثل 1،2." : "أرسل الرقم."}`,
    how: (need, max) => need === max ? (need === 1 ? "اختر واحداً" : `اختر ${need}`)
      : `اختر من ${need}${Number.isFinite(max) ? ` إلى ${max}` : " أو أكثر"}`,
    error: error => {
      switch (error.code) {
        case "shape": return "أرسل أسماء الأصناف والكميات، مثل: 2 كرك، 1 ساندويتش.";
        case "quantity_whole": return "يرجى إرسال اسم الصنف وكمية بعدد صحيح.";
        case "quantity_range": return `اختر كمية من 1 إلى 25 لكل صنف. ${NOT_CHANGED_AR}`;
        case "not_found": return `لم أجد «${error.query}» في القائمة. أرسل «منيو» لأسماء الأصناف، أو «موظف» للمساعدة. ${NOT_CHANGED_AR}`;
        case "remove_ambiguous": return `أي صنف تقصد؟ ${error.names.join("، ")}. أرسل الاسم الكامل للصنف. ${NOT_CHANGED_AR}`;
        case "set_ambiguous": return `${error.name} موجود في طلبك بخيارات مختلفة. أرسل «احذف ${error.name}» ثم أضف ما تريده بالضبط. ${NOT_CHANGED_AR}`;
        case "cart_limit": return `طلبات المحادثة تدعم حتى 20 صنفاً مختلفاً، و25 من كل صنف، و100 قطعة إجمالاً. ${NOT_CHANGED_AR}`;
        case "item_unavailable": return `أحد الأصناف التي اخترتها لم يعد متوفراً. ${NOT_CHANGED_AR}`;
      }
    }
  }
};

export function describeChatError(error: ChatError, lang: ChatLang): string {
  return CHAT_COPY[lang].error(error);
}

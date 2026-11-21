// lib/owner-whatsapp-login/messages.ts
//
// The plain-text WhatsApp messages owners receive from WhatsOrder's number.
// English first, then Arabic. The code sits on its own line so a long-press
// copies just the digits. Pure, so it is unit-testable.

export function ownerLoginLinkMessage(restaurantName: string, url: string): string {
  const name = restaurantName.trim() || "your restaurant";
  return (
    `WhatsOrder: tap the link to open the ${name} dashboard. ` +
    `It works once, for 10 minutes.\n${url}\n\n` +
    `اضغط على الرابط لفتح لوحة تحكم ${name}. يعمل مرة واحدة لمدة 10 دقائق.\n\n` +
    `If you did not ask for this, ignore this message.`
  );
}

export function ownerLoginCodeMessage(code: string): string {
  return (
    `Your WhatsOrder login code (valid 10 minutes):\n\n${code}\n\n` +
    `رمز الدخول إلى WhatsOrder (صالح لمدة 10 دقائق)\n\n` +
    `Do not share this code with anyone. WhatsOrder will never ask you for it.`
  );
}

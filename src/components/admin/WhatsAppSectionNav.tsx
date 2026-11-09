import { BotMessageSquare, Inbox } from "lucide-react";
import Link from "next/link";
import type { WhatsAppIntegration } from "@/lib/whatsapp-integration";

export function WhatsAppSectionNav({
  active,
  canManageAutomation,
  integration
}: {
  active: "inbox" | "automation";
  canManageAutomation: boolean;
  integration: WhatsAppIntegration | null;
}) {
  const connected =
    integration?.provider === "whatsapp_web" && integration.status === "active";

  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink">WhatsApp</h1>
          <p className="text-sm font-semibold text-stone-500">
            Customer conversations and automatic replies in one place.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1.5 text-xs font-black ${
            connected
              ? "bg-emerald-100 text-emerald-700"
              : integration?.status === "error"
                ? "bg-rose-100 text-rose-700"
                : "bg-stone-100 text-stone-500"
          }`}
        >
          {connected
            ? `Connected${integration.phone_number ? ` · +${integration.phone_number}` : ""}`
            : integration?.status === "error"
              ? "Connection needs attention"
              : "Not connected"}
        </span>
      </div>
      <nav className="mt-4 flex flex-wrap gap-2" aria-label="WhatsApp sections">
        <Link
          className={`focus-ring inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black ${
            active === "inbox"
              ? "bg-ink text-white"
              : "bg-stone-100 text-stone-600 hover:bg-stone-200"
          }`}
          href="/admin/chats"
        >
          <Inbox size={16} />
          Inbox
        </Link>
        {canManageAutomation ? (
          <Link
            className={`focus-ring inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black ${
              active === "automation"
                ? "bg-ink text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
            href="/admin/integrations/whatsapp"
          >
            <BotMessageSquare size={16} />
            Automation & setup
          </Link>
        ) : null}
      </nav>
    </div>
  );
}

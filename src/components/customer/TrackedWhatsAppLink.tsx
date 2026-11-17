"use client";

import type { ReactNode } from "react";
import { trackFunnel } from "@/lib/customer-funnel-client";

/** WhatsApp link that records the funnel's last step when tapped. */
export function TrackedWhatsAppLink({
  children,
  className,
  href,
  orderId,
  restaurantId
}: {
  children: ReactNode;
  className?: string;
  href: string;
  orderId: string;
  restaurantId: string;
}) {
  return (
    <a
      className={className}
      href={href}
      onClick={() => trackFunnel(restaurantId, "whatsapp_opened", { orderId })}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

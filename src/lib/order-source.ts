import type { Order } from "@/lib/types";

export type OrderSource = NonNullable<Order["source"]>;
export type OrderSourceView = "all" | OrderSource;

export const ORDER_SOURCES: readonly OrderSource[] = ["customer", "staff", "whatsapp_chat"];

const LABELS: Record<OrderSource, string> = {
  customer: "Menu link",
  staff: "Staff",
  whatsapp_chat: "WhatsApp chat"
};

/** Orders created before orders.source existed default to the customer menu link, as in the database. */
export function orderSource(order: Pick<Order, "source">): OrderSource {
  return order.source && ORDER_SOURCES.includes(order.source) ? order.source : "customer";
}

export function orderSourceLabel(source: OrderSource): string {
  return LABELS[source];
}

export function parseOrderSourceView(value: string | undefined): OrderSourceView {
  return value && (ORDER_SOURCES as readonly string[]).includes(value) ? (value as OrderSource) : "all";
}

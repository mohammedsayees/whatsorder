// lib/marketing/send-store.ts
//
// Service-role Supabase implementation of the marketing send ledger. Every
// query is scoped by restaurant_id (from the session) AND poster_id.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

import type {
  MarketingRecipient,
  MarketingSendRow,
  MarketingSendStore
} from "./send-pipeline";

const CLAIMABLE = ["queued", "failed"];

export function createMarketingSendStore(
  restaurantId: string,
  posterId: string
): MarketingSendStore | null {
  const admin = getSupabaseAdmin();
  if (!admin || !restaurantId || !posterId) {
    return null;
  }
  const table = () => admin.from("marketing_sends");

  return {
    async queue(recipients: MarketingRecipient[], caption: string) {
      const { error } = await table().upsert(
        recipients.map((recipient) => ({
          restaurant_id: restaurantId,
          poster_id: posterId,
          conversation_id: recipient.conversationId,
          customer_phone: recipient.phone,
          status: "queued",
          caption
        })),
        { onConflict: "poster_id,customer_phone", ignoreDuplicates: true }
      );
      if (error) {
        console.error("WhatsOrder marketing: queue failed", error.code);
        return false;
      }
      return true;
    },

    async listForPoster() {
      const { data, error } = await table()
        .select("id, customer_phone, conversation_id, status")
        .eq("restaurant_id", restaurantId)
        .eq("poster_id", posterId);
      if (error) {
        console.error("WhatsOrder marketing: ledger read failed", error.code);
        return null;
      }
      return (data ?? []) as MarketingSendRow[];
    },

    async claim(rowId: string) {
      const { data, error } = await table()
        .update({ status: "sending", error: null })
        .eq("restaurant_id", restaurantId)
        .eq("poster_id", posterId)
        .eq("id", rowId)
        .in("status", CLAIMABLE)
        .select("id");
      if (error) {
        console.error("WhatsOrder marketing: claim failed", error.code);
        return false;
      }
      return Array.isArray(data) && data.length === 1;
    },

    async markSent(rowId: string, waMessageId: string, sentAt: Date) {
      const { error } = await table()
        .update({
          status: "sent",
          wa_message_id: waMessageId,
          sent_at: sentAt.toISOString(),
          error: null
        })
        .eq("restaurant_id", restaurantId)
        .eq("id", rowId);
      if (error) {
        // The row stays `sending`, which the frequency cap still counts, so a
        // lost write can never cause a resend.
        console.error("WhatsOrder marketing: mark sent failed", error.code);
      }
    },

    async markFailed(rowId: string, reason: string) {
      const { error } = await table()
        .update({ status: "failed", error: reason.slice(0, 500) })
        .eq("restaurant_id", restaurantId)
        .eq("id", rowId)
        .eq("status", "sending");
      if (error) {
        console.error("WhatsOrder marketing: mark failed failed", error.code);
      }
    },

    async markSkipped(rowIds: string[], reason: string) {
      const { error } = await table()
        .update({ status: "skipped", error: reason.slice(0, 500) })
        .eq("restaurant_id", restaurantId)
        .eq("poster_id", posterId)
        .in("id", rowIds)
        .in("status", CLAIMABLE);
      if (error) {
        console.error("WhatsOrder marketing: mark skipped failed", error.code);
      }
    }
  };
}

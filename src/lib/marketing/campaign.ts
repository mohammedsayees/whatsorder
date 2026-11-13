// lib/marketing/campaign.ts
//
// Campaigns: one poster sent to one customer segment. Sending reuses the
// Phase 1 pipeline unchanged (consent + open 24h window + frequency cap,
// ledger-first, no double sends); a campaign only narrows that audience to the
// segment's members and explains who can't be reached and why.
//
// Channel seam: today only free in-window sends exist. Paid WhatsApp template
// broadcasts (to opted-in customers outside the window) are deliberately not
// implemented — `template` is declared so the UI and action have a place for
// it, and is rejected until it exists.

import "server-only";

import { getCustomerSegments } from "@/lib/data";
import { isCustomerContactable } from "@/lib/customer-insights";
import type { CustomerSegmentFilter } from "@/lib/customer-insights";
import { getMarketingAudience, type InWindowRecipient } from "@/lib/poster/store";

export type CampaignChannel = "service_window" | "template";

export const CAMPAIGN_CHANNELS: Record<
  CampaignChannel,
  { label: string; available: boolean; note: string }
> = {
  service_window: {
    label: "Free — customers who messaged you in the last 24 hours",
    available: true,
    note: "WhatsApp allows free messages inside a customer's 24-hour window."
  },
  template: {
    label: "Paid template broadcast — everyone opted in",
    available: false,
    note: "Needs an approved WhatsApp template and per-message billing. Not available yet."
  }
};

/** Safety ceiling on how many segment members a campaign reads. */
export const CAMPAIGN_MAX_MEMBERS = 5000;
const PAGE_SIZE = 100;

export type CampaignBreakdown = {
  segmentSize: number;
  /** No marketing consent (or withdrawn). */
  notOptedIn: number;
  /** Opted in, but no open 24h window right now. */
  noOpenWindow: number;
  /** Opted in and in window, but already got a marketing message in 24h. */
  frequencyCapped: number;
  /** Can be sent to right now. */
  reachable: InWindowRecipient[];
  /** The segment was larger than CAMPAIGN_MAX_MEMBERS; counts cover the first part. */
  truncated: boolean;
  /** A read failed; nothing is reachable (fail closed). */
  readFailed: boolean;
};

type Member = {
  phone: string;
  marketing_opt_in?: boolean | null;
  consent_marketing?: boolean | null;
  marketing_consent_withdrawn_at?: string | null;
};

/** Every member of a segment for this restaurant (paged through the segment RPC). */
export async function getSegmentMembers(
  restaurantId: string,
  segment: CustomerSegmentFilter
): Promise<{ members: Member[]; truncated: boolean }> {
  const members: Member[] = [];
  for (let page = 1; members.length < CAMPAIGN_MAX_MEMBERS; page++) {
    const result = await getCustomerSegments(restaurantId, { segment, page, pageSize: PAGE_SIZE });
    members.push(...(result.items as unknown as Member[]));
    if (page >= result.totalPages || result.items.length === 0) {
      return { members, truncated: false };
    }
  }
  return { members: members.slice(0, CAMPAIGN_MAX_MEMBERS), truncated: true };
}

/** Pure: split a segment's members into reachable / why-not buckets. */
export function breakdownCampaign(
  members: Member[],
  audience: { recipients: InWindowRecipient[]; cappedPhones?: string[] }
): Omit<CampaignBreakdown, "truncated" | "readFailed"> {
  const consented = members.filter((member) =>
    isCustomerContactable({
      marketing_opt_in: member.marketing_opt_in ?? false,
      consent_marketing: member.consent_marketing ?? false,
      marketing_consent_withdrawn_at: member.marketing_consent_withdrawn_at ?? null
    })
  );
  const consentedPhones = new Set(consented.map((member) => member.phone));
  const reachable = audience.recipients.filter((recipient) => consentedPhones.has(recipient.phone));
  const capped = (audience.cappedPhones ?? []).filter((phone) => consentedPhones.has(phone)).length;
  return {
    segmentSize: members.length,
    notOptedIn: members.length - consented.length,
    frequencyCapped: capped,
    noOpenWindow: Math.max(0, consented.length - reachable.length - capped),
    reachable
  };
}

export async function getCampaignBreakdown(
  restaurantId: string,
  segment: CustomerSegmentFilter
): Promise<CampaignBreakdown> {
  try {
    const [{ members, truncated }, audience] = await Promise.all([
      getSegmentMembers(restaurantId, segment),
      getMarketingAudience(restaurantId)
    ]);
    if (audience.readFailed) {
      return { ...breakdownCampaign(members, { recipients: [] }), truncated, readFailed: true };
    }
    return { ...breakdownCampaign(members, audience), truncated, readFailed: false };
  } catch (error) {
    console.error("WhatsOrder campaign: breakdown failed", error instanceof Error ? error.message : error);
    return {
      segmentSize: 0,
      notOptedIn: 0,
      noOpenWindow: 0,
      frequencyCapped: 0,
      reachable: [],
      truncated: false,
      readFailed: true
    };
  }
}

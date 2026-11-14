# Pricing v2: Starter / Growth / Personalised

| Plan (code) | Monthly | Yearly (2 months free) | Staff | AI images / month | Gated features |
|---|---|---|---|---|---|
| Starter (`starter`) | AED 149 | AED 1,490 | 3 | 10 | none of: campaigns, chat inbox, finance |
| Growth (`pro`) | AED 299 | AED 2,990 | 10 | 100 | campaigns, chat inbox + AI, finance, advanced analytics, scheduled orders |
| Personalised (`multi_branch`) | from AED 599 | from AED 5,990 | 50 | 300 | everything, plus multi-branch, group reporting, shared menu |

Plan codes are unchanged so existing references keep working. Extra branches
and custom deals are set per restaurant with the existing price override.

## Apply

Apply `supabase/migrations/20261117120000_pricing_tiers_v2.sql` **before**
merging. It:

- pins every live subscription's current price in `price_override`
  ("Grandfathered: pre-November 2026 pricing"), logged in
  `subscription_price_events` with actor role `migration`;
- grants every live subscription all features and no monthly AI image cap via
  the new `subscriptions.feature_overrides`;
- then sets the new plan prices, names, flags (`chat_inbox`, `finance`) and
  `plans.monthly_ai_image_limit`;
- allows `multi_branch` in `restaurants.plan` (assigning that plan used to fail
  in the plan-sync trigger);
- adds the read-only `subscription_feature_events` audit table and logs the
  grandfathered features there;
- fails if any live subscription is left without a pinned price. It is safe to
  re-run and changes no RLS or policies.

A subscription that already had a time-limited discount keeps it; when that
discount ends it moves to the **new** plan price.

## Entitlement rules

- No plan on record: never gated (un-enrolled pilots keep working).
- Trialing: Growth features and at least 100 AI images a month, whatever plan.
- `feature_overrides` wins over the plan and trial (booleans per flag, plus
  `monthly_ai_image_limit`: a number, or null for no monthly cap).
- Customer ordering, and WhatsApp chat **order intake**, are never gated.

## Where it is enforced

- Finance: `requireFinancePermission` (all finance pages and actions).
- Chat inbox: `/admin/chats` page, staff replies, template sends; AI
  receptionist replies in the WhatsApp Web events route (fails closed).
- Marketing: `/admin/marketing`, `/admin/campaigns/new`, poster generation API,
  poster/campaign sends. Offers stay on every plan.
- AI images: one monthly allowance shared by menu photos and poster art, on top
  of the existing per-day caps.

Gated restaurants are sent to `/admin/upgrade`.

## Customising one restaurant (super admin)

**Super admin → Billing → restaurant → Plan features.** For each gated feature
choose *Follow plan*, *Always include* or *Always exclude*; set the AI image
allowance to follow the plan, a custom amount, or no monthly cap. A reason is
required. Changes apply immediately and are logged in
`subscription_feature_events` (shown as "Feature change history").

Personalised contracts may set a contract price **above** list (extra
branches, custom work); other plans only allow discounts.

To remove grandfathering for one restaurant: set every feature back to
*Follow plan*, and clear the contract price under **Update contract**. Moving a
grandfathered restaurant to another plan keeps its pinned price until the
contract price is cleared.

# WhatsApp chat ordering (takeaway)

Customers order takeaway by texting the restaurant's WhatsApp, e.g. `2 karak, 1 smash burger`. The bot replies with an itemised total at current menu prices. The customer replies `YES`, and a real **New, unpaid takeaway order** reaches the POS with `orders.source = 'whatsapp_chat'`. Payment is due at collection.

This runs on the existing signed WhatsApp Web connector. It is not a migration to the Meta Cloud API. It started as the approved-phones pilot (`20260907180000_whatsapp_takeaway_pilot.sql`); v1 is `20261113090000_whatsapp_chat_ordering_v1.sql`.

Out of scope: delivery, voice orders, offers/promotions, online payment. Staff or the menu link handle those.

## Settings and rollout

Dashboard → WhatsApp → Automation & setup → **WhatsApp chat ordering (takeaway)**:

| Setting | Who can order by chat |
| --- | --- |
| Off (default) | Nobody. Everyone gets the existing menu-link receptionist. |
| Approved numbers only | Up to 20 listed numbers (country code, one per line). Everyone else gets the receptionist. |
| Everyone | Any customer who messages the restaurant. |

Automatic replies and text replies must be enabled. The mode lives in `whatsapp_chatbot_settings.chat_ordering_mode`. The database enforces it again in `apply_whatsapp_order_command`, which has the final say. The old pilot switch `chat_ordering_enabled` is kept in sync by a trigger, so the pilot build can still turn ordering off after a rollback.

Recommended rollout: staff phones on **Approved numbers only** → a handful of regulars → review the parse log (below) for a few service days → **Everyone**.

## Conversation flow

1. **Routing.** These messages go to chat ordering before the receptionist's menu-link reply:
   - item lists (`2 karak`, `karak x2`, `two burgers`);
   - order phrases (`I want…`, `can I have…`, `add…`, `remove…`);
   - `MENU`, `ORDER`, `TAKEAWAY`.

   Greetings, thanks and questions (`how much is karak?`, `what time do you close?`) stay with the receptionist, and nothing is saved for them. So does anything Gemini marks as *not an order*. Voice notes are unchanged.
2. **Items.** Exact or word-prefix names (English or catalog Arabic) are matched without AI. Free text is parsed by Gemini, described below. If a name fits several items, the bot asks `Which one did you mean? 1) … 2) …`. If an item isn't found, the bot says so and the order is unchanged.
3. **Required options.** The bot asks one group at a time, e.g. `Karak — Size, choose one: 1) Small 2) Large (+AED 1.50)`. The customer answers with a number or the option name; multi-choice groups take `1,3`. If a required group has only the required number of options available, they are applied automatically. Optional groups are applied only when the customer mentions them.
4. **Name.** The WhatsApp profile name is used: control characters are removed, it is capped at 60 characters, and it must contain a letter. The bot asks `What name should we use for pickup?` only when there is no usable profile name.
5. **Total.** After every change the bot replies with the items, total, pay-at-collection line and order-processing consent text. `CART` shows it again with a fresh total.
6. **YES.** `YES` (also `yes please`, `y`, `confirm`, `نعم`) places the order. `CONFIRM <code>` from the pilot still works.

Other commands: `REMOVE <item>`, `CLEAR`/`CANCEL`, `STAFF` (staff takeover), `NEW ORDER` (after an order was placed). `NAME` and `CHECKOUT` were removed; `CHECKOUT` quietly behaves like `CART`.

Carts last 24 hours after the last message. Limits: 20 different lines, 25 of each, 100 items in total.

### What YES confirms

A YES confirms **only the latest total**, and only when all of these are true:

- a confirmable total exists. Its token is kept only on the server, and any edit clears it;
- it is at most **10 minutes** old;
- no question (item choice, option, name) is waiting for an answer;
- the YES was **not sent before** that total was issued. This uses the WhatsApp message timestamp, with one second of rounding allowed;
- prices, options and availability are unchanged when re-checked.

Otherwise nothing is ordered:

- an expired total or changed price → a fresh total to confirm;
- an open question → the question is asked again;
- a YES that predates the latest total → "nothing was placed" and the latest total;
- no total to confirm → the current order, or the receptionist if there is no order at all.

After an order is placed, every YES or confirmation code just repeats the order ID.

## Gemini parsing

- **Fast path:** the deterministic matcher runs first. Gemini (`gemini-2.5-flash` by default) runs only when the matcher can't place every item.
- **Model selection:** `WHATSAPP_ORDER_AI_MODEL`, then `WHATSAPP_AI_MODEL`, then `GEMINI_MODEL`. It needs `GEMINI_API_KEY`; without it, only matcher names work.
- **What the model sees:** short aliases (`i0`, `o3`) for public, available items and available options. It never sees real IDs, prices or staff-only items. It returns structured JSON (fixed schema, temperature 0, 8 s timeout).
- **Model output is untrusted:**
  - every alias is mapped back and validated against the live menu;
  - unknown aliases, wrong field types and quantities outside 1–25 are rejected, never guessed;
  - options are re-checked against the item's own groups;
  - notes are plain text, capped at 120 characters per item.
- **Prices** come only from `verifyCartAgainstMenu`, and the database checks them again when the order is created.
- **Customer-facing text:** model text never reaches the customer. Clarifying questions are built from menu data, and an unknown phrase is quoted back only if the customer wrote it.
- **Cost guard:** at most **20 Gemini parses per conversation per hour**. Beyond that, only matcher names are understood. A failed or invalid model response falls back to the matcher's "could not find" reply.

## Reviewing parses

Every parse is logged in `whatsapp_order_parse_logs`:

- `parser`: `deterministic` or `gemini`;
- `input_text`;
- `parsed`: the validated result, plus the raw model output for Gemini;
- `outcome`: `accepted`, `clarify`, `rejected` or `error`;
- `reason`, `model`.

Restaurant owners, admins and managers can read their own rows, and super admins can read all. Only the service role writes. Rows older than 90 days are deleted automatically, because they contain customer message text.

Useful checks during rollout (Supabase SQL editor; replace the restaurant ID):

```sql
-- Outcome mix over the last 7 days
select parser, outcome, count(*) from public.whatsapp_order_parse_logs
where restaurant_id = '<restaurant-id>' and created_at > now() - interval '7 days'
group by 1, 2 order by 1, 2;

-- Recent Gemini rejections, errors and dropped ids
select created_at, input_text, outcome, reason, parsed->'result' as result
from public.whatsapp_order_parse_logs
where restaurant_id = '<restaurant-id>' and parser = 'gemini'
  and (outcome in ('rejected', 'error') or reason like 'dropped%')
order by created_at desc limit 50;
```

Compare accepted parses with the orders staff actually prepared. Unmatched names are good candidates for clearer menu names or Arabic names in the catalog.

## Reliability and access

- **Customer identity** comes from the verified connector sender, never from phone numbers in the chat text. The restaurant/session mapping is verified first.
- **State and duplicates:**
  - drafts, message receipts and parse logs are service-role only, with foreign keys that keep each row inside one restaurant;
  - a revision check, the conversation lock, the per-message receipt and the per-quote submission token together make sure each quote creates at most one order;
  - a revision conflict re-runs the turn up to three times, then fails so the connector retries.
- **Order creation:**
  - `create_order_with_customer_v4` is reused unchanged;
  - inside the creation transaction, `whatsapp_chat_line_is_current` re-checks every line: availability, option links, min/max per group, and price (base plus option deltas, compared in cents);
  - totals are rounded to 2 decimal places;
  - tickets stay unpaid until staff collect payment;
  - the total message includes the order-processing consent text; no marketing opt-in is requested.
- **Unchanged:**
  - staff takeover (`STAFF`, or a manual staff reply) pauses automation before the handoff reply is sent;
  - each number can still place at most ten orders per ten minutes;
  - inbound messages are saved before the webhook acknowledges them;
  - a reply can occasionally repeat if sending succeeds but recording the delivery fails. The order itself stays unique.

## Deploying and rolling back

1. Apply `supabase/migrations/20261113090000_whatsapp_chat_ordering_v1.sql` to Supabase **before** deploying the app code (migration-first). It checks itself and aborts if a write policy appears on the parse log or any of these objects become reachable from the browser.
2. Deploy. Existing pilot restaurants start in **Approved numbers only** with their numbers kept.
3. Optional: set `WHATSAPP_ORDER_AI_MODEL`; check `GEMINI_API_KEY` is set.

**Rollback:** set the mode to **Off** (or untick the pilot switch on the old build). Turning ordering off does not cancel submitted orders. Keep the migration installed when rolling back app code. It is additive, and the replaced `apply_whatsapp_order_command` keeps the pilot's signature and behaviour for approved phones. Pilot carts with options are now re-checked instead of rejected.

## Testing

- Unit and integration: `npm test`. Covers parsing validation, routing, YES edge cases, options, duplicate-order protection, Gemini handling, the hourly limit and logging. Run it under Node 22 together with `npm run typecheck` and `npm run lint`.
- Database: `npm run test:database` against a disposable database. `supabase/tests/whatsapp_chat_ordering_v1.sql` covers the rollout modes, option re-checks, chat source, notes, rounding in cents, duplicate confirmations and parse-log access and retention. `whatsapp_takeaway_pilot.sql` still passes.
- Manual, from an approved phone:
  1. Send `2 karak, 1 <item>` and answer any option question.
  2. Check the total, then reply `YES`.
  3. Confirm one order appears in the POS with source WhatsApp chat.
  4. Reply `YES` again and confirm the same order ID comes back, with no second order.
  5. Cancel test orders in the dashboard with a test reason.

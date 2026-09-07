# WhatsApp takeaway pilot

The pilot runs on the existing signed WhatsApp Web connector. It is disabled by default and restricted to up to 20 approved phone numbers per restaurant. Other customers continue to receive the existing menu-link receptionist. This does not migrate the restaurant to Meta Cloud API.

## Enable and test

1. Open Dashboard → WhatsApp → Automation & setup.
2. Keep automatic replies and text replies enabled. Under **Takeaway chat-ordering pilot**, add the test phones with country code, one per line, and enable the pilot. Save settings.
3. From an approved phone, send `MENU`. Choose a simple item using its displayed name, for example `2 karak, 1 chicken sandwich`.
4. Send `NAME Test customer`, then `CHECKOUT`. Check the items, total and takeaway/payment details. No order exists yet.
5. Reply with the exact `CONFIRM <code>` shown. This creates a **real New, unpaid takeaway order**. The code expires after ten minutes.
6. Verify the dashboard has one order. Repeat the confirmation and verify it returns the same order ID, without a second order.
7. For a test order, cancel it in the dashboard with a test reason before staff prepare it. For a real order, use the normal kitchen and payment-at-completion workflow.

Use `CART` to resume, `REMOVE <item name>` to remove the entire line, `CLEAR` to clear an unsent cart, `STAFF` for human takeover, and `NEW ORDER` to start again after an order is submitted. To change quantity, remove the item and add the intended quantity. Carts last 24 hours after their last interaction. Menu pages contain 20 simple products; send `MENU 2`, etc., for more. Ambiguous names require the full product name; a rejected multi-item message leaves the entire cart unchanged.

The chat flow uses English commands and replies. Exact Arabic product names are accepted when present in the catalog. Customizable products, special preparation instructions, offers, delivery, voice ordering and online payment are outside this pilot. Staff or the existing menu handle those requests. The receptionist preview in the dashboard does not simulate a saved ordering conversation.

## Reliability and access

- Customer identity comes from the verified connector sender, never a phone number supplied in the chat text. Restaurant/session mapping is verified before processing.
- Database drafts, message receipts, version checks and a conversation lock prevent lost concurrent edits and duplicate order creation. Replies can occasionally repeat if sending succeeds but delivery recording fails; the order itself stays unique.
- Menu prices and availability are checked at checkout and again in the creation transaction. A changed quote requires a new confirmation. Confirmation of a superseded cart cannot submit the replacement cart.
- Existing server-side pricing and `create_order_with_customer_v4` are reused. Confirmed tickets remain unpaid until staff collect payment. Order-processing consent is included in the confirmation message; no marketing opt-in is requested.
- Staff takeover pauses automation before the handoff reply is sent. A manual staff reply also uses the existing pause behavior. Resume AI from the inbox when appropriate.
- Drafts and receipt tables are service-role only, with tenant-consistent foreign keys. An approved number can create at most ten orders per ten minutes.
- Inbound pilot commands are persisted before the webhook acknowledges them. The existing connector retries failed callbacks three times; after a prolonged outage, the customer can resend the message. Reconfirming the same cart will not duplicate its order.

## Rollout and rollback

Apply `supabase/migrations/20260907180000_whatsapp_takeaway_pilot.sql` before deploying the application. Enable only for test phones initially. Disable the pilot switch to return those phones to the existing receptionist; disabling does not cancel submitted orders. Existing orders remain available in the dashboard. Keep the additive migration installed when rolling back application code.

Before expanding, review incorrect or ambiguous product matches, completed orders, staff handoffs and abandoned carts during actual service. Do not enable broadly until staff have checked the pilot's order accuracy.

# WhatsOrder Restaurant Pilot Testing

Use this checklist to run a 7-day pilot.

## Test Flow

1. Open the restaurant’s `/r/[slug]` URL.
2. Add at least two items to cart.
3. Go to checkout.
4. Enter:
   - Name
   - Phone number
   - Delivery area
   - Full address
   - Notes
   - Payment method
5. Accept order-processing consent.
6. Optionally accept marketing consent.
7. Click `Send Order on WhatsApp`.
8. Confirm WhatsApp opens with a structured message.
9. Confirm order appears in `/admin/orders`.
10. Update status from `New` to `Accepted`, `Preparing`, and `Completed`.
11. Confirm customer appears in `/admin/customers`.
12. Repeat with the same phone number and confirm `total_orders` and `total_spend` update.
13. Enable sound alerts and place an order from a separate phone.
14. Confirm the dashboard shows `Live`, plays a sound, highlights the order, and updates its count.
15. Test Delivery, Takeaway, Bring to My Car, and Dine In when each option is enabled.
16. Complete an order, request feedback, submit it, approve it, and verify the public review.
17. Invite a temporary staff account, sign in, revoke it, and confirm access is removed.

## Daily Operational Checks

- Keep the restaurant dashboard open on a dedicated charged device.
- Confirm the Realtime indicator says `Live`.
- Confirm sound alerts are enabled after browser/device restarts.
- Review `New` orders and accept them promptly.
- If the indicator says `Offline`, refresh the dashboard and place a test order.
- Keep the restaurant’s direct WhatsApp number available as the fallback ordering route.

## Metrics to Track for 7 Days

- Number of menu visits
- Number of orders submitted
- Order completion rate
- Average order value
- Most ordered items
- Repeat customers
- Orders with missing/incorrect address
- Staff time spent clarifying WhatsApp orders
- Cancelled orders
- Customer complaints or confusion points

## Restaurant Staff Questions

- Was the WhatsApp message easier to read than normal customer messages?
- Did the order dashboard help track status?
- Were menu item edits easy enough?
- Which statuses are actually useful in daily work?
- What information is still missing from the order?
- Would this reduce phone calls or back-and-forth messages?
- What would you need before using this daily?

## Customer Questions

- Was the menu link easy to use?
- Was checkout clear?
- Did the WhatsApp handoff feel natural?
- Did you understand why consent was required?
- Would you prefer this over typing an order manually?
- Was anything too slow or confusing?

## Success Criteria

The pilot is promising if:

- Staff can process orders without extra explanation.
- Customers complete checkout without help.
- Orders contain fewer missing details.
- Repeat customers are tracked correctly.
- Chai Xpress wants to continue testing after 7 days.

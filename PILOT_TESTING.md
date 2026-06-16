# Chai Xpress Pilot Testing

Use this checklist to run a 7-day pilot.

## Test Flow

1. Open `/r/chaixpress`.
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

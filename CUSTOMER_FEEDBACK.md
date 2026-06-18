# Customer Feedback

WhatsOrder requests feedback only after an order is marked `Completed`.

## Flow

1. Restaurant staff marks an order as Completed.
2. The Orders page shows **Request feedback**.
3. Tapping it creates a secure, 14-day, single-order feedback link.
4. WhatsApp opens with a prepared thank-you message and the link.
5. The customer submits a 1–5 star rating, optional tags, and an optional comment.
6. Restaurant owners and managers moderate written comments in `/admin/feedback`.

Each order accepts one feedback submission. The public rating includes every verified completed-order
rating. Only approved written comments appear on the public restaurant menu.

## Privacy

Public reviews never expose phone numbers, addresses, car plates, or order details. Customer names
are shortened to a first name and last initial, or displayed as Anonymous when selected.

## Restaurant control

Restaurant owners can enable or disable public review display under `/admin/settings`.

## Database

Run:

```text
supabase/customer_feedback_migration.sql
```

after the fulfilment migration.

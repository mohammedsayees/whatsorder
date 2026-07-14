# Customer Profiles and Loyalty Foundation

WhatsOrder stores a lightweight customer profile per restaurant and phone number for restaurant-side
history, analytics, consent, and loyalty. Customer details are not publicly retrievable by phone.

## Customer Identity

Customers are identified by:

```text
restaurant_id + phone
```

This lets every restaurant keep its own customer list, even when the same phone number orders from more than one restaurant in the future.

## Customer-facing lookup

Checkout does not retrieve a profile from a phone number. Customers enter their details for each
order until OTP verification or authenticated customer accounts are available.

## Consent Handling

Checkout requires this consent:

```text
I agree that this restaurant can save my details to process my order and make future ordering easier.
```

Marketing consent remains optional:

```text
I agree to receive offers and updates from this restaurant on WhatsApp.
```

The latest consent values are stored on the customer profile:

- `consent_order_processing`
- `consent_marketing`
- `consent_timestamp`
- `marketing_opt_in`

## Stored Customer Fields

The `customers` table stores:

- `name`
- `phone`
- `delivery_area`
- `delivery_address`
- `default_landmark`
- `default_latitude`
- `default_longitude`
- `default_google_maps_url`
- `total_orders`
- `total_spend`
- `last_order_at`
- `marketing_opt_in`
- `consent_order_processing`
- `consent_marketing`
- `consent_timestamp`
- `loyalty_points_balance`
- `lifetime_points_earned`

## Production Migration

For an existing Supabase project, run this additive SQL file in the Supabase SQL Editor:

```text
supabase/customer_profile_loyalty_migration.sql
```

This adds the new columns, loyalty table, indexes, RLS policy, and schema cache reload without resetting seed menu data.

## Admin Order History

Restaurant admins can see customer order history inside `/admin/customers`.

Public customer-facing previous orders are intentionally not enabled yet. A future version should require OTP verification before showing previous orders or one-tap reorder options.

## Loyalty Foundation

The current foundation stores loyalty fields but does not support redemption yet.

Customer fields:

- `loyalty_points_balance`
- `lifetime_points_earned`

Order fields:

- `points_earned`
- `points_redeemed`
- `loyalty_discount`

Loyalty transaction table:

- `restaurant_id`
- `customer_id`
- `order_id`
- `type`
- `points`
- `description`
- `created_at`

Current rule:

```text
Every AED 1 spent = 1 point
```

Points are awarded only when an admin changes an order status to `Completed`. If an order is cancelled, points are not awarded. If an already completed order is saved again, points are not duplicated.

## Privacy note

Saved-address lookup by phone number is disabled in the application. A phone number is guessable and
must not be treated as proof of identity. Re-enable saved-address autofill only after adding OTP
verification or authenticated customer accounts.

## Future Improvements

- OTP verification before customer-facing order history
- Reorder from previous order
- Loyalty redemption at checkout
- Manual loyalty adjustments by restaurant staff
- Campaigns based on spend, repeat orders, location, and marketing opt-in

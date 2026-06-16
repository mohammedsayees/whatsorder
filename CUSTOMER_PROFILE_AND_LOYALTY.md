# Customer Profiles and Loyalty Foundation

WhatsOrder now stores a lightweight customer profile per restaurant and phone number. This keeps repeat ordering simple without adding customer passwords or public order-history access.

## Customer Identity

Customers are identified by:

```text
restaurant_id + phone
```

This lets every restaurant keep its own customer list, even when the same phone number orders from more than one restaurant in the future.

## Saved Address Flow

During checkout:

1. Customer enters their phone number.
2. WhatsOrder checks for a matching customer profile for that restaurant.
3. If found, checkout shows:

```text
We found your saved details. Use saved address?
```

4. Customer can apply the saved name, area, address, landmark, and saved Google Maps location.
5. Customer can still edit all details before sending the order on WhatsApp.

Only saved address data is returned to the checkout. Full order history is not shown publicly by phone number.

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

## Future Improvements

- OTP verification before customer-facing order history
- Reorder from previous order
- Loyalty redemption at checkout
- Manual loyalty adjustments by restaurant staff
- Campaigns based on spend, repeat orders, location, and marketing opt-in

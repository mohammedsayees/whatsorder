# Dine In

Restaurant owners can enable or disable Dine In under restaurant settings.

Customers choosing Dine In enter a table number. Restaurants can also place a table-specific QR
code using a URL such as:

```text
/r/chaixpress?table=12
```

The table number is carried into checkout automatically. Customers can still edit it when required.
Dine-in orders have no delivery fee and appear in the dashboard with a Dine In badge and prominent
table number. Their operational statuses include `Ready to Serve` instead of `Out for Delivery`.

Run:

```text
supabase/dine_in_migration.sql
```

after the fulfilment migration.

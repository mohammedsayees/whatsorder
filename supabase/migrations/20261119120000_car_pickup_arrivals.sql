-- Car pickup "I'm here": the customer taps "I've arrived" on their order page
-- (optionally saying where they parked), and staff see who is waiting outside.
--
-- Written only by the service role from /api/customer/order-arrived after the
-- signed per-order cookie check. No new policies: staff already read their
-- own restaurant's orders through the existing tenant-scoped select policy.

alter table public.orders
  add column if not exists customer_arrived_at timestamptz,
  add column if not exists customer_arrival_note text;

do $arrival_note_check$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_customer_arrival_note_length'
  ) then
    alter table public.orders
      add constraint orders_customer_arrival_note_length
      check (customer_arrival_note is null or char_length(customer_arrival_note) <= 80);
  end if;
end
$arrival_note_check$;

-- The dashboard asks "who is outside right now" on every alert refresh.
create index if not exists idx_orders_waiting_car_arrivals
on public.orders(restaurant_id, customer_arrived_at)
where customer_arrived_at is not null
  and fulfilment_type = 'car_pickup'
  and status in ('New', 'Accepted', 'Preparing', 'Ready to Serve');

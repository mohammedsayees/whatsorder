-- WhatsOrder Phase 1.5: collect payment at completion
--
-- Staff counter tickets are punched in and sent to the kitchen before payment
-- is collected. Payment is captured when the order is completed. To represent a
-- not-yet-paid ticket, the payment method is left empty until completion, so the
-- column must allow null.
--
-- Cash and reporting are unaffected: the shift summary and reports only consider
-- Completed orders, which always have a payment method captured by the time they
-- reach that state.

alter table public.orders
  alter column payment_method drop not null;

notify pgrst, 'reload schema';

-- Rollback consideration:
-- Re-adding NOT NULL would fail while any unpaid (in-progress) staff ticket has
-- a null payment method. Complete or cancel those first if rolling back.

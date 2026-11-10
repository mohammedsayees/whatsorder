-- Commit the enum value before the ledger migration uses it in functions and
-- triggers. Keeping this as a separate migration avoids PostgreSQL's
-- "unsafe use of new value" restriction inside one transaction.
alter type public.payment_method add value if not exists 'Customer Credit';

notify pgrst, 'reload schema';

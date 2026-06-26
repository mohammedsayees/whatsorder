-- WhatsOrder — PUBLIC SCHEMA REFERENCE SNAPSHOT
--
-- ⚠️  REFERENCE ONLY — DO NOT EXECUTE against the live database.
--
-- This file is a faithful, generated snapshot of the *already-applied* public
-- schema of the production Supabase project (tables, constraints, indexes, RLS
-- policies, functions, triggers). Its purpose is to make index coverage and RLS
-- reviewable in-repo, since the original base-schema migration predates this
-- repository's supabase/migrations/ history.
--
-- It is intentionally NOT placed in supabase/migrations/ and is NOT idempotent:
-- running it as-is would fail (objects already exist) or, on a fresh database,
-- would need ordering/ownership/grants that this snapshot does not reproduce.
-- The authoritative, incremental change history remains supabase/migrations/.
--
-- Regenerate with the catalog-introspection query in the audit notes. Generated
-- from project ktcgpdfpqhypyerbbkwr (Postgres 17).



-- =============================================================
-- ENUM TYPES
-- =============================================================

CREATE TYPE public.order_status AS ENUM ('New', 'Accepted', 'Preparing', 'Out for Delivery', 'Completed', 'Cancelled', 'Ready to Serve');

CREATE TYPE public.payment_method AS ENUM ('Cash on Delivery', 'Card on Delivery');


-- =============================================================
-- TABLES
-- =============================================================

CREATE TABLE public.customer_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  rating integer NOT NULL,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  comment text,
  customer_display_name text NOT NULL DEFAULT 'Anonymous'::text,
  is_verified_order boolean NOT NULL DEFAULT true,
  moderation_status text NOT NULL DEFAULT 'pending'::text,
  restaurant_response text,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  published_at timestamp with time zone
);

CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  delivery_area text NOT NULL,
  delivery_address text NOT NULL,
  total_orders integer NOT NULL DEFAULT 0,
  total_spend numeric(10,2) NOT NULL DEFAULT 0,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  default_latitude numeric(10,7),
  default_longitude numeric(10,7),
  default_google_maps_url text,
  default_address_text text,
  default_landmark text,
  last_order_at timestamp with time zone,
  consent_order_processing boolean NOT NULL DEFAULT false,
  consent_marketing boolean NOT NULL DEFAULT false,
  consent_timestamp timestamp with time zone,
  loyalty_points_balance integer NOT NULL DEFAULT 0,
  lifetime_points_earned integer NOT NULL DEFAULT 0,
  marketing_consent_updated_at timestamp with time zone,
  marketing_consent_source text,
  marketing_consent_withdrawn_at timestamp with time zone
);

CREATE TABLE public.feedback_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.loyalty_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  order_id uuid,
  type text NOT NULL,
  points integer NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.menu_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  name_ar text
);

CREATE TABLE public.menu_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  category_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  price numeric(10,2) NOT NULL,
  image_url text,
  is_available boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  name_ar text,
  description_ar text
);

CREATE TABLE public.menu_offers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  menu_item_id uuid NOT NULL,
  title text NOT NULL,
  title_ar text,
  description text,
  description_ar text,
  promotional_price numeric(10,2) NOT NULL,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  max_quantity_per_order integer NOT NULL DEFAULT 1
);

CREATE TABLE public.onboarding_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  task_key text NOT NULL,
  task_label text NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.order_payment_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  from_method text,
  to_method text NOT NULL,
  actor_user_id uuid,
  actor_role text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.order_print_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  print_kind text NOT NULL,
  actor_user_id uuid,
  actor_role text,
  device_label text,
  is_reprint boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.order_status_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  from_status order_status,
  to_status order_status NOT NULL,
  actor_user_id uuid,
  actor_role text,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.order_submission_attempts (
  id bigint NOT NULL,
  restaurant_id uuid NOT NULL,
  client_fingerprint text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.order_submission_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  submission_token text NOT NULL,
  order_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  delivery_area text,
  delivery_address text,
  notes text,
  payment_method payment_method,
  items jsonb NOT NULL,
  subtotal numeric(10,2) NOT NULL,
  delivery_fee numeric(10,2) NOT NULL,
  total numeric(10,2) NOT NULL,
  status order_status NOT NULL DEFAULT 'New'::order_status,
  whatsapp_message text NOT NULL,
  consent_order_processing boolean NOT NULL,
  consent_marketing boolean NOT NULL DEFAULT false,
  consent_timestamp timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  delivery_latitude numeric(10,7),
  delivery_longitude numeric(10,7),
  delivery_google_maps_url text,
  delivery_place_id text,
  delivery_address_text text,
  delivery_landmark text,
  points_earned integer NOT NULL DEFAULT 0,
  points_redeemed integer NOT NULL DEFAULT 0,
  loyalty_discount numeric(10,2) NOT NULL DEFAULT 0,
  fulfilment_type text NOT NULL DEFAULT 'delivery'::text,
  car_plate_number text,
  car_description text,
  table_number text,
  shift_id uuid,
  source text NOT NULL DEFAULT 'customer'::text
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'restaurant_admin'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.restaurant_shifts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  shift_name text NOT NULL,
  status text NOT NULL DEFAULT 'open'::text,
  opening_cash_amount numeric(10,2) NOT NULL DEFAULT 0,
  cash_counted_amount numeric(10,2),
  completed_order_count integer NOT NULL DEFAULT 0,
  completed_sales numeric(10,2) NOT NULL DEFAULT 0,
  completed_cash_order_total numeric(10,2) NOT NULL DEFAULT 0,
  card_on_delivery_total numeric(10,2) NOT NULL DEFAULT 0,
  cash_paid_out_total numeric(10,2) NOT NULL DEFAULT 0,
  cancelled_order_count integer NOT NULL DEFAULT 0,
  fulfilment_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_cash_amount numeric(10,2),
  difference_amount numeric(10,2),
  opened_by_user_id uuid NOT NULL,
  closed_by_user_id uuid,
  opened_at timestamp with time zone NOT NULL DEFAULT now(),
  closed_at timestamp with time zone,
  opening_note text,
  closing_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.restaurant_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  user_id uuid,
  email text NOT NULL,
  role text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  invited_at timestamp with time zone,
  accepted_at timestamp with time zone
);

CREATE TABLE public.restaurants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  logo_url text,
  whatsapp_number text NOT NULL,
  address text,
  delivery_fee numeric(10,2) NOT NULL DEFAULT 0,
  minimum_order_amount numeric(10,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  name_ar text,
  address_ar text,
  subtitle_ar text,
  owner_name text,
  owner_email text,
  owner_phone text,
  city text,
  subtitle text,
  cover_image_url text,
  status text NOT NULL DEFAULT 'draft'::text,
  plan text NOT NULL DEFAULT 'trial'::text,
  pickup_enabled boolean NOT NULL DEFAULT true,
  delivery_enabled boolean NOT NULL DEFAULT true,
  scheduled_orders_enabled boolean NOT NULL DEFAULT false,
  internal_notes text,
  car_pickup_enabled boolean NOT NULL DEFAULT false,
  public_reviews_enabled boolean NOT NULL DEFAULT false,
  dine_in_enabled boolean NOT NULL DEFAULT false,
  accepting_orders boolean NOT NULL DEFAULT true,
  opening_hours_enabled boolean NOT NULL DEFAULT false,
  opening_hours jsonb NOT NULL DEFAULT '{"friday": {"open": "08:00", "close": "23:00", "closed": false}, "monday": {"open": "08:00", "close": "23:00", "closed": false}, "sunday": {"open": "08:00", "close": "23:00", "closed": false}, "tuesday": {"open": "08:00", "close": "23:00", "closed": false}, "saturday": {"open": "08:00", "close": "23:00", "closed": false}, "thursday": {"open": "08:00", "close": "23:00", "closed": false}, "wednesday": {"open": "08:00", "close": "23:00", "closed": false}}'::jsonb,
  latitude double precision,
  longitude double precision,
  delivery_radius_km numeric(6,2),
  commission_rate numeric(5,2)
);

CREATE TABLE public.shift_cash_paid_outs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  shift_id uuid NOT NULL,
  amount numeric(10,2) NOT NULL,
  reason text NOT NULL,
  recorded_by_user_id uuid NOT NULL,
  recorded_at timestamp with time zone NOT NULL DEFAULT now()
);


-- =============================================================
-- CONSTRAINTS (primary key, unique, check, foreign key)
-- =============================================================

ALTER TABLE public.customer_feedback ADD CONSTRAINT customer_feedback_pkey PRIMARY KEY (id);

ALTER TABLE public.customers ADD CONSTRAINT customers_pkey PRIMARY KEY (id);

ALTER TABLE public.feedback_requests ADD CONSTRAINT feedback_requests_pkey PRIMARY KEY (id);

ALTER TABLE public.loyalty_transactions ADD CONSTRAINT loyalty_transactions_pkey PRIMARY KEY (id);

ALTER TABLE public.menu_categories ADD CONSTRAINT menu_categories_pkey PRIMARY KEY (id);

ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);

ALTER TABLE public.menu_offers ADD CONSTRAINT menu_offers_pkey PRIMARY KEY (id);

ALTER TABLE public.onboarding_tasks ADD CONSTRAINT onboarding_tasks_pkey PRIMARY KEY (id);

ALTER TABLE public.order_payment_events ADD CONSTRAINT order_payment_events_pkey PRIMARY KEY (id);

ALTER TABLE public.order_print_events ADD CONSTRAINT order_print_events_pkey PRIMARY KEY (id);

ALTER TABLE public.order_status_events ADD CONSTRAINT order_status_events_pkey PRIMARY KEY (id);

ALTER TABLE public.order_submission_attempts ADD CONSTRAINT order_submission_attempts_pkey PRIMARY KEY (id);

ALTER TABLE public.order_submission_keys ADD CONSTRAINT order_submission_keys_pkey PRIMARY KEY (id);

ALTER TABLE public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.restaurant_shifts ADD CONSTRAINT restaurant_shifts_pkey PRIMARY KEY (id);

ALTER TABLE public.restaurant_users ADD CONSTRAINT restaurant_users_pkey PRIMARY KEY (id);

ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_pkey PRIMARY KEY (id);

ALTER TABLE public.shift_cash_paid_outs ADD CONSTRAINT shift_cash_paid_outs_pkey PRIMARY KEY (id);

ALTER TABLE public.customer_feedback ADD CONSTRAINT customer_feedback_order_id_key UNIQUE (order_id);

ALTER TABLE public.customers ADD CONSTRAINT customers_id_restaurant_unique UNIQUE (id, restaurant_id);

ALTER TABLE public.customers ADD CONSTRAINT customers_restaurant_id_phone_key UNIQUE (restaurant_id, phone);

ALTER TABLE public.feedback_requests ADD CONSTRAINT feedback_requests_order_id_key UNIQUE (order_id);

ALTER TABLE public.feedback_requests ADD CONSTRAINT feedback_requests_token_hash_key UNIQUE (token_hash);

ALTER TABLE public.menu_categories ADD CONSTRAINT menu_categories_id_restaurant_unique UNIQUE (id, restaurant_id);

ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_id_restaurant_unique UNIQUE (id, restaurant_id);

ALTER TABLE public.menu_offers ADD CONSTRAINT menu_offers_restaurant_id_menu_item_id_key UNIQUE (restaurant_id, menu_item_id);

ALTER TABLE public.onboarding_tasks ADD CONSTRAINT onboarding_tasks_restaurant_id_task_key_key UNIQUE (restaurant_id, task_key);

ALTER TABLE public.order_submission_keys ADD CONSTRAINT order_submission_keys_restaurant_id_submission_token_key UNIQUE (restaurant_id, submission_token);

ALTER TABLE public.orders ADD CONSTRAINT orders_id_restaurant_unique UNIQUE (id, restaurant_id);

ALTER TABLE public.restaurant_shifts ADD CONSTRAINT restaurant_shifts_id_restaurant_unique UNIQUE (id, restaurant_id);

ALTER TABLE public.restaurant_users ADD CONSTRAINT restaurant_users_restaurant_id_email_key UNIQUE (restaurant_id, email);

ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_slug_key UNIQUE (slug);

ALTER TABLE public.customer_feedback ADD CONSTRAINT customer_feedback_moderation_status_check CHECK ((moderation_status = ANY (ARRAY['pending'::text, 'approved'::text, 'hidden'::text])));

ALTER TABLE public.customer_feedback ADD CONSTRAINT customer_feedback_rating_check CHECK (((rating >= 1) AND (rating <= 5)));

ALTER TABLE public.loyalty_transactions ADD CONSTRAINT loyalty_transactions_type_check CHECK ((type = ANY (ARRAY['earned'::text, 'redeemed'::text, 'adjusted'::text, 'expired'::text])));

ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_price_check CHECK ((price >= (0)::numeric));

ALTER TABLE public.menu_offers ADD CONSTRAINT menu_offers_check CHECK (((ends_at IS NULL) OR (starts_at IS NULL) OR (ends_at >= starts_at)));

ALTER TABLE public.menu_offers ADD CONSTRAINT menu_offers_max_quantity_check CHECK (((max_quantity_per_order >= 1) AND (max_quantity_per_order <= 25)));

ALTER TABLE public.menu_offers ADD CONSTRAINT menu_offers_promotional_price_check CHECK ((promotional_price >= (0)::numeric));

ALTER TABLE public.order_print_events ADD CONSTRAINT order_print_events_print_kind_check CHECK ((print_kind = ANY (ARRAY['kot'::text, 'receipt'::text])));

ALTER TABLE public.orders ADD CONSTRAINT orders_car_pickup_plate_check CHECK (((fulfilment_type <> 'car_pickup'::text) OR (NULLIF(TRIM(BOTH FROM car_plate_number), ''::text) IS NOT NULL)));

ALTER TABLE public.orders ADD CONSTRAINT orders_delivery_fee_check CHECK ((delivery_fee >= (0)::numeric));

ALTER TABLE public.orders ADD CONSTRAINT orders_dine_in_table_check CHECK (((fulfilment_type <> 'dine_in'::text) OR (NULLIF(TRIM(BOTH FROM table_number), ''::text) IS NOT NULL)));

ALTER TABLE public.orders ADD CONSTRAINT orders_fulfilment_type_check CHECK ((fulfilment_type = ANY (ARRAY['delivery'::text, 'takeaway'::text, 'car_pickup'::text, 'dine_in'::text])));

ALTER TABLE public.orders ADD CONSTRAINT orders_source_check CHECK ((source = ANY (ARRAY['customer'::text, 'staff'::text])));

ALTER TABLE public.orders ADD CONSTRAINT orders_subtotal_check CHECK ((subtotal >= (0)::numeric));

ALTER TABLE public.orders ADD CONSTRAINT orders_total_check CHECK ((total >= (0)::numeric));

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['super_admin'::text, 'restaurant_admin'::text, 'staff'::text])));

ALTER TABLE public.restaurant_shifts ADD CONSTRAINT restaurant_shifts_cash_counted_amount_check CHECK (((cash_counted_amount IS NULL) OR (cash_counted_amount >= (0)::numeric)));

ALTER TABLE public.restaurant_shifts ADD CONSTRAINT restaurant_shifts_closed_fields_check CHECK ((((status = 'open'::text) AND (closed_at IS NULL) AND (closed_by_user_id IS NULL)) OR ((status = 'closed'::text) AND (closed_at IS NOT NULL) AND (closed_by_user_id IS NOT NULL) AND (cash_counted_amount IS NOT NULL) AND (expected_cash_amount IS NOT NULL) AND (difference_amount IS NOT NULL))));

ALTER TABLE public.restaurant_shifts ADD CONSTRAINT restaurant_shifts_opening_cash_amount_check CHECK ((opening_cash_amount >= (0)::numeric));

ALTER TABLE public.restaurant_shifts ADD CONSTRAINT restaurant_shifts_shift_name_check CHECK (((char_length(TRIM(BOTH FROM shift_name)) >= 1) AND (char_length(TRIM(BOTH FROM shift_name)) <= 80)));

ALTER TABLE public.restaurant_shifts ADD CONSTRAINT restaurant_shifts_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])));

ALTER TABLE public.restaurant_users ADD CONSTRAINT restaurant_users_role_check CHECK ((role = ANY (ARRAY['super_admin'::text, 'restaurant_admin'::text, 'staff'::text, 'owner'::text, 'manager'::text])));

ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_commission_rate_range CHECK (((commission_rate IS NULL) OR ((commission_rate > (0)::numeric) AND (commission_rate <= (100)::numeric))));

ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_plan_check CHECK ((plan = ANY (ARRAY['trial'::text, 'starter'::text, 'growth'::text, 'pro'::text, 'custom'::text])));

ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'onboarding'::text, 'live'::text, 'trial'::text, 'paid'::text, 'paused'::text, 'cancelled'::text])));

ALTER TABLE public.shift_cash_paid_outs ADD CONSTRAINT shift_cash_paid_outs_amount_check CHECK ((amount > (0)::numeric));

ALTER TABLE public.shift_cash_paid_outs ADD CONSTRAINT shift_cash_paid_outs_reason_check CHECK (((char_length(TRIM(BOTH FROM reason)) >= 1) AND (char_length(TRIM(BOTH FROM reason)) <= 300)));

ALTER TABLE public.customer_feedback ADD CONSTRAINT customer_feedback_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE public.customer_feedback ADD CONSTRAINT customer_feedback_order_tenant_fkey FOREIGN KEY (order_id, restaurant_id) REFERENCES orders(id, restaurant_id);

ALTER TABLE public.customer_feedback ADD CONSTRAINT customer_feedback_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.customers ADD CONSTRAINT customers_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.feedback_requests ADD CONSTRAINT feedback_requests_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE public.feedback_requests ADD CONSTRAINT feedback_requests_order_tenant_fkey FOREIGN KEY (order_id, restaurant_id) REFERENCES orders(id, restaurant_id);

ALTER TABLE public.feedback_requests ADD CONSTRAINT feedback_requests_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.loyalty_transactions ADD CONSTRAINT loyalty_transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE public.loyalty_transactions ADD CONSTRAINT loyalty_transactions_customer_tenant_fkey FOREIGN KEY (customer_id, restaurant_id) REFERENCES customers(id, restaurant_id);

ALTER TABLE public.loyalty_transactions ADD CONSTRAINT loyalty_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

ALTER TABLE public.loyalty_transactions ADD CONSTRAINT loyalty_transactions_order_tenant_fkey FOREIGN KEY (order_id, restaurant_id) REFERENCES orders(id, restaurant_id);

ALTER TABLE public.loyalty_transactions ADD CONSTRAINT loyalty_transactions_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.menu_categories ADD CONSTRAINT menu_categories_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE CASCADE;

ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_category_tenant_fkey FOREIGN KEY (category_id, restaurant_id) REFERENCES menu_categories(id, restaurant_id);

ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.menu_offers ADD CONSTRAINT menu_offers_item_tenant_fkey FOREIGN KEY (menu_item_id, restaurant_id) REFERENCES menu_items(id, restaurant_id);

ALTER TABLE public.menu_offers ADD CONSTRAINT menu_offers_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE;

ALTER TABLE public.menu_offers ADD CONSTRAINT menu_offers_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.onboarding_tasks ADD CONSTRAINT onboarding_tasks_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.order_payment_events ADD CONSTRAINT order_payment_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.order_payment_events ADD CONSTRAINT order_payment_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE public.order_payment_events ADD CONSTRAINT order_payment_events_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.order_print_events ADD CONSTRAINT order_print_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.order_print_events ADD CONSTRAINT order_print_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE public.order_print_events ADD CONSTRAINT order_print_events_order_tenant_fkey FOREIGN KEY (order_id, restaurant_id) REFERENCES orders(id, restaurant_id);

ALTER TABLE public.order_print_events ADD CONSTRAINT order_print_events_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.order_status_events ADD CONSTRAINT order_status_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.order_status_events ADD CONSTRAINT order_status_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE public.order_status_events ADD CONSTRAINT order_status_events_order_tenant_fkey FOREIGN KEY (order_id, restaurant_id) REFERENCES orders(id, restaurant_id);

ALTER TABLE public.order_status_events ADD CONSTRAINT order_status_events_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.order_submission_attempts ADD CONSTRAINT order_submission_attempts_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.order_submission_keys ADD CONSTRAINT order_submission_keys_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE public.order_submission_keys ADD CONSTRAINT order_submission_keys_order_tenant_fkey FOREIGN KEY (order_id, restaurant_id) REFERENCES orders(id, restaurant_id);

ALTER TABLE public.order_submission_keys ADD CONSTRAINT order_submission_keys_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.orders ADD CONSTRAINT orders_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.orders ADD CONSTRAINT orders_shift_tenant_fkey FOREIGN KEY (shift_id, restaurant_id) REFERENCES restaurant_shifts(id, restaurant_id) ON DELETE RESTRICT;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.restaurant_shifts ADD CONSTRAINT restaurant_shifts_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.restaurant_users ADD CONSTRAINT restaurant_users_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.shift_cash_paid_outs ADD CONSTRAINT shift_cash_paid_outs_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.shift_cash_paid_outs ADD CONSTRAINT shift_cash_paid_outs_shift_tenant_fkey FOREIGN KEY (shift_id, restaurant_id) REFERENCES restaurant_shifts(id, restaurant_id) ON DELETE RESTRICT;


-- =============================================================
-- INDEXES (non-constraint)
-- =============================================================

CREATE INDEX idx_customer_feedback_public ON public.customer_feedback USING btree (restaurant_id, moderation_status, published_at DESC);

CREATE INDEX idx_customer_feedback_restaurant_submitted ON public.customer_feedback USING btree (restaurant_id, submitted_at DESC);

CREATE INDEX idx_customers_restaurant_phone ON public.customers USING btree (restaurant_id, phone);

CREATE INDEX idx_customers_restaurant_updated ON public.customers USING btree (restaurant_id, updated_at DESC);

CREATE INDEX idx_feedback_requests_token ON public.feedback_requests USING btree (token_hash);

CREATE UNIQUE INDEX idx_loyalty_one_earned_transaction_per_order ON public.loyalty_transactions USING btree (order_id) WHERE ((type = 'earned'::text) AND (order_id IS NOT NULL));

CREATE INDEX idx_loyalty_transactions_restaurant_customer ON public.loyalty_transactions USING btree (restaurant_id, customer_id);

CREATE INDEX idx_menu_categories_restaurant ON public.menu_categories USING btree (restaurant_id);

CREATE INDEX idx_menu_items_restaurant ON public.menu_items USING btree (restaurant_id);

CREATE INDEX idx_menu_offers_restaurant_active_order ON public.menu_offers USING btree (restaurant_id, is_active, display_order);

CREATE UNIQUE INDEX idx_menu_offers_restaurant_item_unique ON public.menu_offers USING btree (restaurant_id, menu_item_id);

CREATE INDEX idx_onboarding_tasks_restaurant ON public.onboarding_tasks USING btree (restaurant_id);

CREATE INDEX idx_order_payment_events_order_created ON public.order_payment_events USING btree (restaurant_id, order_id, created_at DESC);

CREATE INDEX idx_order_print_events_order_created ON public.order_print_events USING btree (restaurant_id, order_id, created_at);

CREATE INDEX idx_order_status_events_order_created ON public.order_status_events USING btree (restaurant_id, order_id, created_at);

CREATE INDEX idx_order_status_events_restaurant_created ON public.order_status_events USING btree (restaurant_id, created_at DESC);

CREATE INDEX idx_order_submission_attempts_lookup ON public.order_submission_attempts USING btree (restaurant_id, client_fingerprint, created_at DESC);

CREATE INDEX idx_orders_restaurant_created ON public.orders USING btree (restaurant_id, created_at DESC);

CREATE INDEX idx_orders_restaurant_customer_phone ON public.orders USING btree (restaurant_id, customer_phone);

CREATE INDEX idx_orders_restaurant_fulfilment_created ON public.orders USING btree (restaurant_id, fulfilment_type, created_at DESC);

CREATE INDEX idx_orders_restaurant_shift ON public.orders USING btree (restaurant_id, shift_id);

CREATE INDEX idx_orders_restaurant_source_created ON public.orders USING btree (restaurant_id, source, created_at DESC);

CREATE INDEX idx_orders_restaurant_status_created ON public.orders USING btree (restaurant_id, status, created_at DESC);

CREATE INDEX idx_orders_status ON public.orders USING btree (status);

CREATE INDEX idx_orders_unassigned_completed ON public.orders USING btree (restaurant_id, status) WHERE (shift_id IS NULL);

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);

CREATE UNIQUE INDEX idx_restaurant_shifts_one_open ON public.restaurant_shifts USING btree (restaurant_id) WHERE (status = 'open'::text);

CREATE INDEX idx_restaurant_shifts_restaurant_opened ON public.restaurant_shifts USING btree (restaurant_id, opened_at DESC);

CREATE INDEX idx_restaurant_users_active_user ON public.restaurant_users USING btree (user_id, accepted_at) WHERE (user_id IS NOT NULL);

CREATE INDEX idx_restaurant_users_user ON public.restaurant_users USING btree (user_id);

CREATE INDEX idx_restaurants_plan ON public.restaurants USING btree (plan);

CREATE INDEX idx_restaurants_status ON public.restaurants USING btree (status);

CREATE INDEX idx_shift_cash_paid_outs_shift_recorded ON public.shift_cash_paid_outs USING btree (restaurant_id, shift_id, recorded_at);


-- =============================================================
-- ROW LEVEL SECURITY (enable)
-- =============================================================

ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.feedback_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.menu_offers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.onboarding_tasks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_payment_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_print_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_submission_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_submission_keys ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.restaurant_shifts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.restaurant_users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.shift_cash_paid_outs ENABLE ROW LEVEL SECURITY;


-- =============================================================
-- RLS POLICIES
-- =============================================================

CREATE POLICY "Public can read active categories" ON public.menu_categories AS PERMISSIVE FOR SELECT TO public USING (((is_active = true) AND is_public_restaurant(restaurant_id)));

CREATE POLICY "Public can read active menu offers" ON public.menu_offers AS PERMISSIVE FOR SELECT TO public USING (((is_active = true) AND ((starts_at IS NULL) OR (starts_at <= now())) AND ((ends_at IS NULL) OR (ends_at >= now())) AND is_public_restaurant(restaurant_id)));

CREATE POLICY "Public can read menu items for active restaurants" ON public.menu_items AS PERMISSIVE FOR SELECT TO public USING (((is_available = true) AND is_public_restaurant(restaurant_id)));

CREATE POLICY "Restaurant managers can read all shift paid outs" ON public.shift_cash_paid_outs AS PERMISSIVE FOR SELECT TO public USING (is_restaurant_member(restaurant_id, ARRAY['restaurant_admin'::text, 'owner'::text, 'manager'::text]));

CREATE POLICY "Restaurant managers can read all shifts" ON public.restaurant_shifts AS PERMISSIVE FOR SELECT TO public USING (is_restaurant_member(restaurant_id, ARRAY['restaurant_admin'::text, 'owner'::text, 'manager'::text]));

CREATE POLICY "Restaurant managers can read own customers" ON public.customers AS PERMISSIVE FOR SELECT TO public USING (is_restaurant_member(restaurant_id, ARRAY['restaurant_admin'::text, 'owner'::text, 'manager'::text]));

CREATE POLICY "Restaurant managers can read own feedback" ON public.customer_feedback AS PERMISSIVE FOR SELECT TO public USING (is_restaurant_member(restaurant_id, ARRAY['restaurant_admin'::text, 'owner'::text, 'manager'::text]));

CREATE POLICY "Restaurant managers can read own loyalty transactions" ON public.loyalty_transactions AS PERMISSIVE FOR SELECT TO public USING (is_restaurant_member(restaurant_id, ARRAY['restaurant_admin'::text, 'owner'::text, 'manager'::text]));

CREATE POLICY "Restaurant staff can read current and own shifts" ON public.restaurant_shifts AS PERMISSIVE FOR SELECT TO public USING ((is_restaurant_member(restaurant_id, ARRAY['staff'::text]) AND ((status = 'open'::text) OR (opened_by_user_id = auth.uid()))));

CREATE POLICY "Restaurant staff can read current shift paid outs" ON public.shift_cash_paid_outs AS PERMISSIVE FOR SELECT TO public USING ((is_restaurant_member(restaurant_id, ARRAY['staff'::text]) AND (EXISTS ( SELECT 1
   FROM restaurant_shifts shift
  WHERE ((shift.id = shift_cash_paid_outs.shift_id) AND (shift.restaurant_id = shift_cash_paid_outs.restaurant_id) AND ((shift.status = 'open'::text) OR (shift.opened_by_user_id = auth.uid())))))));

CREATE POLICY "Restaurant users can read own categories" ON public.menu_categories AS PERMISSIVE FOR SELECT TO public USING (is_restaurant_member(restaurant_id));

CREATE POLICY "Restaurant users can read own memberships" ON public.restaurant_users AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));

CREATE POLICY "Restaurant users can read own menu items" ON public.menu_items AS PERMISSIVE FOR SELECT TO public USING (is_restaurant_member(restaurant_id));

CREATE POLICY "Restaurant users can read own menu offers" ON public.menu_offers AS PERMISSIVE FOR SELECT TO public USING (is_restaurant_member(restaurant_id));

CREATE POLICY "Restaurant users can read own onboarding tasks" ON public.onboarding_tasks AS PERMISSIVE FOR SELECT TO public USING (is_restaurant_member(restaurant_id));

CREATE POLICY "Restaurant users can read own order payment events" ON public.order_payment_events AS PERMISSIVE FOR SELECT TO public USING (is_restaurant_member(restaurant_id));

CREATE POLICY "Restaurant users can read own order print events" ON public.order_print_events AS PERMISSIVE FOR SELECT TO public USING (is_restaurant_member(restaurant_id));

CREATE POLICY "Restaurant users can read own order status events" ON public.order_status_events AS PERMISSIVE FOR SELECT TO public USING (is_restaurant_member(restaurant_id));

CREATE POLICY "Restaurant users can read own orders" ON public.orders AS PERMISSIVE FOR SELECT TO public USING (is_restaurant_member(restaurant_id));

CREATE POLICY "Restaurant users can read own restaurants" ON public.restaurants AS PERMISSIVE FOR SELECT TO public USING (is_restaurant_member(id));

CREATE POLICY "Super admins can read all categories" ON public.menu_categories AS PERMISSIVE FOR SELECT TO public USING (is_super_admin());

CREATE POLICY "Super admins can read all customers" ON public.customers AS PERMISSIVE FOR SELECT TO public USING (is_super_admin());

CREATE POLICY "Super admins can read all feedback" ON public.customer_feedback AS PERMISSIVE FOR SELECT TO public USING (is_super_admin());

CREATE POLICY "Super admins can read all loyalty transactions" ON public.loyalty_transactions AS PERMISSIVE FOR SELECT TO public USING (is_super_admin());

CREATE POLICY "Super admins can read all menu items" ON public.menu_items AS PERMISSIVE FOR SELECT TO public USING (is_super_admin());

CREATE POLICY "Super admins can read all menu offers" ON public.menu_offers AS PERMISSIVE FOR SELECT TO public USING (is_super_admin());

CREATE POLICY "Super admins can read all onboarding tasks" ON public.onboarding_tasks AS PERMISSIVE FOR SELECT TO public USING (is_super_admin());

CREATE POLICY "Super admins can read all order payment events" ON public.order_payment_events AS PERMISSIVE FOR SELECT TO public USING (is_super_admin());

CREATE POLICY "Super admins can read all order print events" ON public.order_print_events AS PERMISSIVE FOR SELECT TO public USING (is_super_admin());

CREATE POLICY "Super admins can read all order status events" ON public.order_status_events AS PERMISSIVE FOR SELECT TO public USING (is_super_admin());

CREATE POLICY "Super admins can read all orders" ON public.orders AS PERMISSIVE FOR SELECT TO public USING (is_super_admin());

CREATE POLICY "Super admins can read all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING (is_super_admin());

CREATE POLICY "Super admins can read all restaurant users" ON public.restaurant_users AS PERMISSIVE FOR SELECT TO public USING (is_super_admin());

CREATE POLICY "Super admins can read all restaurants" ON public.restaurants AS PERMISSIVE FOR SELECT TO public USING (is_super_admin());

CREATE POLICY "Users can read own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING (((id = auth.uid()) OR is_super_admin()));


-- =============================================================
-- FUNCTIONS / PROCEDURES
-- =============================================================

CREATE OR REPLACE FUNCTION public.add_shift_cash_paid_out(target_restaurant_id uuid, target_shift_id uuid, requested_amount numeric, requested_reason text, event_actor_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor_role text;
  shift_opener uuid;
  paid_out_id uuid;
begin
  actor_role := public.shift_actor_role(
    target_restaurant_id,
    event_actor_user_id
  );

  select opened_by_user_id
  into shift_opener
  from public.restaurant_shifts
  where id = target_shift_id
    and restaurant_id = target_restaurant_id
    and status = 'open'
  for update;

  if not found then
    raise exception 'Open shift not found';
  end if;

  if actor_role is null
     or (
       actor_role = 'staff'
       and shift_opener <> event_actor_user_id
     ) then
    raise exception 'Only the shift opener or restaurant management can add a paid-out';
  end if;

  if requested_amount is null or requested_amount <= 0 then
    raise exception 'Paid-out amount must be greater than zero';
  end if;

  if nullif(trim(requested_reason), '') is null
     or char_length(trim(requested_reason)) > 300 then
    raise exception 'A paid-out reason is required and must be 300 characters or fewer';
  end if;

  insert into public.shift_cash_paid_outs (
    restaurant_id,
    shift_id,
    amount,
    reason,
    recorded_by_user_id
  )
  values (
    target_restaurant_id,
    target_shift_id,
    round(requested_amount, 2),
    trim(requested_reason),
    event_actor_user_id
  )
  returning id into paid_out_id;

  return paid_out_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_restaurant_shift_summary(target_restaurant_id uuid, target_shift_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with target_shift as (
    select *
    from public.restaurant_shifts
    where id = target_shift_id
      and restaurant_id = target_restaurant_id
  ),
  completed as (
    select
      count(*)::integer as completed_order_count,
      coalesce(sum(total), 0)::numeric(10, 2) as completed_sales,
      coalesce(
        sum(total) filter (where payment_method = 'Cash on Delivery'),
        0
      )::numeric(10, 2) as completed_cash_order_total,
      coalesce(
        sum(total) filter (where payment_method = 'Card on Delivery'),
        0
      )::numeric(10, 2) as card_on_delivery_total
    from public.orders
    where restaurant_id = target_restaurant_id
      and shift_id = target_shift_id
      and status = 'Completed'
  ),
  paid_outs as (
    select coalesce(sum(amount), 0)::numeric(10, 2) as cash_paid_out_total
    from public.shift_cash_paid_outs
    where restaurant_id = target_restaurant_id
      and shift_id = target_shift_id
  ),
  fulfilment as (
    select coalesce(
      jsonb_object_agg(
        fulfilment_type,
        jsonb_build_object('orders', order_count, 'sales', sales)
      ),
      '{}'::jsonb
    ) as breakdown
    from (
      select
        fulfilment_type,
        count(*)::integer as order_count,
        sum(total)::numeric(10, 2) as sales
      from public.orders
      where restaurant_id = target_restaurant_id
        and shift_id = target_shift_id
        and status = 'Completed'
      group by fulfilment_type
    ) values_by_fulfilment
  ),
  cancelled as (
    select count(distinct event.order_id)::integer as cancelled_order_count
    from public.order_status_events event
    cross join target_shift shift
    where event.restaurant_id = target_restaurant_id
      and event.to_status = 'Cancelled'
      and event.created_at >= shift.opened_at
      and event.created_at <= coalesce(shift.closed_at, now())
  )
  select jsonb_build_object(
    'completed_order_count', completed.completed_order_count,
    'completed_sales', completed.completed_sales,
    'completed_cash_order_total', completed.completed_cash_order_total,
    'card_on_delivery_total', completed.card_on_delivery_total,
    'cash_paid_out_total', paid_outs.cash_paid_out_total,
    'cancelled_order_count', cancelled.cancelled_order_count,
    'fulfilment_breakdown', fulfilment.breakdown,
    'expected_cash_amount',
      (
        shift.opening_cash_amount
        + completed.completed_cash_order_total
        - paid_outs.cash_paid_out_total
      )::numeric(10, 2)
  )
  from target_shift shift
  cross join completed
  cross join paid_outs
  cross join fulfilment
  cross join cancelled;
$function$
;

CREATE OR REPLACE FUNCTION public.check_order_submission_rate_limit(target_restaurant_id uuid, target_client_fingerprint text, attempt_limit integer DEFAULT 8, window_size_seconds integer DEFAULT 600)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  recent_attempts integer;
begin
  if attempt_limit < 1 or window_size_seconds < 1 then
    return false;
  end if;

  delete from public.order_submission_attempts
  where created_at < now() - interval '1 day';

  select count(*)
  into recent_attempts
  from public.order_submission_attempts
  where restaurant_id = target_restaurant_id
    and client_fingerprint = target_client_fingerprint
    and created_at >= now() - make_interval(secs => window_size_seconds);

  if recent_attempts >= attempt_limit then
    return false;
  end if;

  insert into public.order_submission_attempts (restaurant_id, client_fingerprint)
  values (target_restaurant_id, target_client_fingerprint);

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.close_restaurant_shift(target_restaurant_id uuid, target_shift_id uuid, requested_cash_counted_amount numeric, requested_closing_note text, event_actor_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor_role text;
  shift_opener uuid;
  summary jsonb;
  expected_cash numeric(10, 2);
  difference numeric(10, 2);
begin
  actor_role := public.shift_actor_role(
    target_restaurant_id,
    event_actor_user_id
  );

  select opened_by_user_id
  into shift_opener
  from public.restaurant_shifts
  where id = target_shift_id
    and restaurant_id = target_restaurant_id
    and status = 'open'
  for update;

  if not found then
    raise exception 'Open shift not found';
  end if;

  if actor_role is null
     or (
       actor_role = 'staff'
       and shift_opener <> event_actor_user_id
     ) then
    raise exception 'Only the shift opener or restaurant management can close this shift';
  end if;

  if requested_cash_counted_amount is null
     or requested_cash_counted_amount < 0 then
    raise exception 'Counted cash cannot be negative';
  end if;

  summary := public.calculate_restaurant_shift_summary(
    target_restaurant_id,
    target_shift_id
  );

  expected_cash := (summary->>'expected_cash_amount')::numeric(10, 2);
  difference := round(requested_cash_counted_amount, 2) - expected_cash;

  if difference <> 0
     and nullif(trim(requested_closing_note), '') is null then
    raise exception 'A closing note is required when cash has a difference';
  end if;

  update public.restaurant_shifts
  set
    status = 'closed',
    cash_counted_amount = round(requested_cash_counted_amount, 2),
    expected_cash_amount = expected_cash,
    difference_amount = difference,
    completed_order_count =
      (summary->>'completed_order_count')::integer,
    completed_sales = (summary->>'completed_sales')::numeric(10, 2),
    completed_cash_order_total =
      (summary->>'completed_cash_order_total')::numeric(10, 2),
    card_on_delivery_total =
      (summary->>'card_on_delivery_total')::numeric(10, 2),
    cash_paid_out_total =
      (summary->>'cash_paid_out_total')::numeric(10, 2),
    cancelled_order_count =
      (summary->>'cancelled_order_count')::integer,
    fulfilment_breakdown = summary->'fulfilment_breakdown',
    closing_note = nullif(left(trim(requested_closing_note), 500), ''),
    closed_by_user_id = event_actor_user_id,
    closed_at = now()
  where id = target_shift_id
    and restaurant_id = target_restaurant_id
    and status = 'open';

  return target_shift_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_order_with_customer(target_restaurant_id uuid, order_customer_name text, order_customer_phone text, order_fulfilment_type text, order_car_plate_number text, order_car_description text, order_delivery_area text, order_delivery_address text, order_delivery_latitude numeric, order_delivery_longitude numeric, order_delivery_google_maps_url text, order_delivery_place_id text, order_delivery_address_text text, order_delivery_landmark text, order_notes text, order_payment_method text, order_items jsonb, order_subtotal numeric, order_delivery_fee numeric, order_total numeric, order_whatsapp_message text, order_consent_processing boolean, order_consent_marketing boolean, order_consent_timestamp timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_order_id uuid;
  restaurant_record public.restaurants%rowtype;
  is_delivery boolean := order_fulfilment_type = 'delivery';
begin
  if order_fulfilment_type not in ('delivery', 'takeaway', 'car_pickup') then
    raise exception 'Invalid fulfilment type';
  end if;

  if not order_consent_processing then
    raise exception 'Order-processing consent is required';
  end if;

  if jsonb_typeof(order_items) <> 'array' or jsonb_array_length(order_items) = 0 then
    raise exception 'Order items are required';
  end if;

  if order_subtotal < 0 or order_delivery_fee < 0 or order_total < 0 then
    raise exception 'Order totals cannot be negative';
  end if;

  select *
  into restaurant_record
  from public.restaurants
  where id = target_restaurant_id
    and is_active = true
    and status in ('live', 'trial', 'paid');

  if not found then
    raise exception 'Restaurant is not accepting orders';
  end if;

  if order_fulfilment_type = 'delivery' then
    if restaurant_record.delivery_enabled is not true then
      raise exception 'Delivery is not enabled';
    end if;
    if nullif(trim(order_delivery_area), '') is null
       or nullif(trim(order_delivery_address), '') is null then
      raise exception 'Delivery details are required';
    end if;
    if order_delivery_fee <> restaurant_record.delivery_fee
       or order_total <> order_subtotal + restaurant_record.delivery_fee then
      raise exception 'Delivery total is invalid';
    end if;
  elsif order_fulfilment_type = 'takeaway' then
    if restaurant_record.pickup_enabled is not true then
      raise exception 'Takeaway is not enabled';
    end if;
    if order_delivery_fee <> 0 or order_total <> order_subtotal then
      raise exception 'Takeaway total is invalid';
    end if;
  else
    if restaurant_record.car_pickup_enabled is not true then
      raise exception 'Car pickup is not enabled';
    end if;
    if nullif(trim(order_car_plate_number), '') is null then
      raise exception 'Car plate number is required';
    end if;
    if order_delivery_fee <> 0 or order_total <> order_subtotal then
      raise exception 'Car pickup total is invalid';
    end if;
  end if;

  insert into public.orders (
    restaurant_id,
    customer_name,
    customer_phone,
    fulfilment_type,
    car_plate_number,
    car_description,
    delivery_area,
    delivery_address,
    delivery_latitude,
    delivery_longitude,
    delivery_google_maps_url,
    delivery_place_id,
    delivery_address_text,
    delivery_landmark,
    notes,
    payment_method,
    items,
    subtotal,
    delivery_fee,
    total,
    points_earned,
    points_redeemed,
    loyalty_discount,
    status,
    whatsapp_message,
    consent_order_processing,
    consent_marketing,
    consent_timestamp
  )
  values (
    target_restaurant_id,
    order_customer_name,
    order_customer_phone,
    order_fulfilment_type,
    nullif(trim(order_car_plate_number), ''),
    nullif(trim(order_car_description), ''),
    case when is_delivery then order_delivery_area else null end,
    case when is_delivery then order_delivery_address else null end,
    case when is_delivery then order_delivery_latitude else null end,
    case when is_delivery then order_delivery_longitude else null end,
    case when is_delivery then order_delivery_google_maps_url else null end,
    case when is_delivery then order_delivery_place_id else null end,
    case when is_delivery then order_delivery_address_text else null end,
    case when is_delivery then order_delivery_landmark else null end,
    order_notes,
    order_payment_method::public.payment_method,
    order_items,
    order_subtotal,
    order_delivery_fee,
    order_total,
    0,
    0,
    0,
    'New',
    order_whatsapp_message,
    order_consent_processing,
    order_consent_marketing,
    order_consent_timestamp
  )
  returning id into new_order_id;

  insert into public.customers (
    restaurant_id,
    name,
    phone,
    delivery_area,
    delivery_address,
    default_latitude,
    default_longitude,
    default_google_maps_url,
    default_address_text,
    default_landmark,
    total_orders,
    total_spend,
    last_order_at,
    marketing_opt_in,
    consent_order_processing,
    consent_marketing,
    consent_timestamp,
    loyalty_points_balance,
    lifetime_points_earned,
    updated_at
  )
  values (
    target_restaurant_id,
    order_customer_name,
    order_customer_phone,
    case when is_delivery then order_delivery_area else '' end,
    case when is_delivery then order_delivery_address else '' end,
    case when is_delivery then order_delivery_latitude else null end,
    case when is_delivery then order_delivery_longitude else null end,
    case when is_delivery then order_delivery_google_maps_url else null end,
    case when is_delivery then order_delivery_address_text else null end,
    case when is_delivery then order_delivery_landmark else null end,
    1,
    order_total,
    order_consent_timestamp,
    order_consent_marketing,
    order_consent_processing,
    order_consent_marketing,
    order_consent_timestamp,
    0,
    0,
    order_consent_timestamp
  )
  on conflict (restaurant_id, phone) do update set
    name = excluded.name,
    delivery_area = case
      when is_delivery then excluded.delivery_area
      else customers.delivery_area
    end,
    delivery_address = case
      when is_delivery then excluded.delivery_address
      else customers.delivery_address
    end,
    default_latitude = case
      when is_delivery then excluded.default_latitude
      else customers.default_latitude
    end,
    default_longitude = case
      when is_delivery then excluded.default_longitude
      else customers.default_longitude
    end,
    default_google_maps_url = case
      when is_delivery then excluded.default_google_maps_url
      else customers.default_google_maps_url
    end,
    default_address_text = case
      when is_delivery then excluded.default_address_text
      else customers.default_address_text
    end,
    default_landmark = case
      when is_delivery then excluded.default_landmark
      else customers.default_landmark
    end,
    total_orders = customers.total_orders + 1,
    total_spend = customers.total_spend + excluded.total_spend,
    last_order_at = excluded.last_order_at,
    marketing_opt_in = customers.marketing_opt_in or excluded.marketing_opt_in,
    consent_order_processing = excluded.consent_order_processing,
    consent_marketing = customers.consent_marketing or excluded.consent_marketing,
    consent_timestamp = excluded.consent_timestamp,
    updated_at = excluded.updated_at;

  return new_order_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_order_with_customer(target_restaurant_id uuid, order_customer_name text, order_customer_phone text, order_delivery_area text, order_delivery_address text, order_delivery_latitude numeric, order_delivery_longitude numeric, order_delivery_google_maps_url text, order_delivery_place_id text, order_delivery_address_text text, order_delivery_landmark text, order_notes text, order_payment_method text, order_items jsonb, order_subtotal numeric, order_delivery_fee numeric, order_total numeric, order_whatsapp_message text, order_consent_processing boolean, order_consent_marketing boolean, order_consent_timestamp timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_order_id uuid;
begin
  if not order_consent_processing then
    raise exception 'Order-processing consent is required';
  end if;

  if jsonb_typeof(order_items) <> 'array' or jsonb_array_length(order_items) = 0 then
    raise exception 'Order items are required';
  end if;

  if order_subtotal < 0 or order_delivery_fee < 0 or order_total < 0 then
    raise exception 'Order totals cannot be negative';
  end if;

  if not exists (
    select 1
    from public.restaurants
    where id = target_restaurant_id
      and is_active = true
      and status in ('live', 'trial', 'paid')
  ) then
    raise exception 'Restaurant is not accepting orders';
  end if;

  insert into public.orders (
    restaurant_id,
    customer_name,
    customer_phone,
    delivery_area,
    delivery_address,
    delivery_latitude,
    delivery_longitude,
    delivery_google_maps_url,
    delivery_place_id,
    delivery_address_text,
    delivery_landmark,
    notes,
    payment_method,
    items,
    subtotal,
    delivery_fee,
    total,
    points_earned,
    points_redeemed,
    loyalty_discount,
    status,
    whatsapp_message,
    consent_order_processing,
    consent_marketing,
    consent_timestamp
  )
  values (
    target_restaurant_id,
    order_customer_name,
    order_customer_phone,
    order_delivery_area,
    order_delivery_address,
    order_delivery_latitude,
    order_delivery_longitude,
    order_delivery_google_maps_url,
    order_delivery_place_id,
    order_delivery_address_text,
    order_delivery_landmark,
    order_notes,
    order_payment_method::public.payment_method,
    order_items,
    order_subtotal,
    order_delivery_fee,
    order_total,
    0,
    0,
    0,
    'New',
    order_whatsapp_message,
    order_consent_processing,
    order_consent_marketing,
    order_consent_timestamp
  )
  returning id into new_order_id;

  insert into public.customers (
    restaurant_id,
    name,
    phone,
    delivery_area,
    delivery_address,
    default_latitude,
    default_longitude,
    default_google_maps_url,
    default_address_text,
    default_landmark,
    total_orders,
    total_spend,
    last_order_at,
    marketing_opt_in,
    consent_order_processing,
    consent_marketing,
    consent_timestamp,
    loyalty_points_balance,
    lifetime_points_earned,
    updated_at
  )
  values (
    target_restaurant_id,
    order_customer_name,
    order_customer_phone,
    order_delivery_area,
    order_delivery_address,
    order_delivery_latitude,
    order_delivery_longitude,
    order_delivery_google_maps_url,
    order_delivery_address_text,
    order_delivery_landmark,
    1,
    order_total,
    order_consent_timestamp,
    order_consent_marketing,
    order_consent_processing,
    order_consent_marketing,
    order_consent_timestamp,
    0,
    0,
    order_consent_timestamp
  )
  on conflict (restaurant_id, phone) do update set
    name = excluded.name,
    delivery_area = excluded.delivery_area,
    delivery_address = excluded.delivery_address,
    default_latitude = excluded.default_latitude,
    default_longitude = excluded.default_longitude,
    default_google_maps_url = excluded.default_google_maps_url,
    default_address_text = excluded.default_address_text,
    default_landmark = excluded.default_landmark,
    total_orders = customers.total_orders + 1,
    total_spend = customers.total_spend + excluded.total_spend,
    last_order_at = excluded.last_order_at,
    marketing_opt_in = customers.marketing_opt_in or excluded.marketing_opt_in,
    consent_order_processing = excluded.consent_order_processing,
    consent_marketing = customers.consent_marketing or excluded.consent_marketing,
    consent_timestamp = excluded.consent_timestamp,
    updated_at = excluded.updated_at;

  return new_order_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_order_with_customer_v2(target_restaurant_id uuid, order_customer_name text, order_customer_phone text, order_fulfilment_type text, order_car_plate_number text, order_car_description text, order_table_number text, order_delivery_area text, order_delivery_address text, order_delivery_latitude numeric, order_delivery_longitude numeric, order_delivery_google_maps_url text, order_delivery_place_id text, order_delivery_address_text text, order_delivery_landmark text, order_notes text, order_payment_method text, order_items jsonb, order_subtotal numeric, order_delivery_fee numeric, order_total numeric, order_whatsapp_message text, order_consent_processing boolean, order_consent_marketing boolean, order_consent_timestamp timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_order_id uuid;
begin
  if order_fulfilment_type = 'dine_in' then
    if nullif(trim(order_table_number), '') is null then
      raise exception 'Table number is required';
    end if;

    if not exists (
      select 1
      from public.restaurants
      where id = target_restaurant_id
        and dine_in_enabled = true
        and is_active = true
        and status in ('live', 'trial', 'paid')
    ) then
      raise exception 'Dine In is not enabled';
    end if;

    if not order_consent_processing then
      raise exception 'Order-processing consent is required';
    end if;

    if jsonb_typeof(order_items) <> 'array' or jsonb_array_length(order_items) = 0 then
      raise exception 'Order items are required';
    end if;

    if order_subtotal < 0 or order_delivery_fee <> 0 or order_total <> order_subtotal then
      raise exception 'Dine In total is invalid';
    end if;

    insert into public.orders (
      restaurant_id,
      customer_name,
      customer_phone,
      fulfilment_type,
      table_number,
      notes,
      payment_method,
      items,
      subtotal,
      delivery_fee,
      total,
      points_earned,
      points_redeemed,
      loyalty_discount,
      status,
      whatsapp_message,
      consent_order_processing,
      consent_marketing,
      consent_timestamp
    )
    values (
      target_restaurant_id,
      order_customer_name,
      order_customer_phone,
      'dine_in',
      trim(order_table_number),
      order_notes,
      order_payment_method::public.payment_method,
      order_items,
      order_subtotal,
      0,
      order_subtotal,
      0,
      0,
      0,
      'New',
      order_whatsapp_message,
      order_consent_processing,
      order_consent_marketing,
      order_consent_timestamp
    )
    returning id into new_order_id;

    insert into public.customers (
      restaurant_id,
      name,
      phone,
      delivery_area,
      delivery_address,
      total_orders,
      total_spend,
      last_order_at,
      marketing_opt_in,
      consent_order_processing,
      consent_marketing,
      consent_timestamp,
      loyalty_points_balance,
      lifetime_points_earned,
      updated_at
    )
    values (
      target_restaurant_id,
      order_customer_name,
      order_customer_phone,
      '',
      '',
      1,
      order_total,
      order_consent_timestamp,
      order_consent_marketing,
      order_consent_processing,
      order_consent_marketing,
      order_consent_timestamp,
      0,
      0,
      order_consent_timestamp
    )
    on conflict (restaurant_id, phone) do update set
      name = excluded.name,
      total_orders = customers.total_orders + 1,
      total_spend = customers.total_spend + excluded.total_spend,
      last_order_at = excluded.last_order_at,
      marketing_opt_in = customers.marketing_opt_in or excluded.marketing_opt_in,
      consent_order_processing = excluded.consent_order_processing,
      consent_marketing = customers.consent_marketing or excluded.consent_marketing,
      consent_timestamp = excluded.consent_timestamp,
      updated_at = excluded.updated_at;

    return new_order_id;
  end if;

  return public.create_order_with_customer(
    target_restaurant_id,
    order_customer_name,
    order_customer_phone,
    order_fulfilment_type,
    order_car_plate_number,
    order_car_description,
    order_delivery_area,
    order_delivery_address,
    order_delivery_latitude,
    order_delivery_longitude,
    order_delivery_google_maps_url,
    order_delivery_place_id,
    order_delivery_address_text,
    order_delivery_landmark,
    order_notes,
    order_payment_method,
    order_items,
    order_subtotal,
    order_delivery_fee,
    order_total,
    order_whatsapp_message,
    order_consent_processing,
    order_consent_marketing,
    order_consent_timestamp
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_order_with_customer_v3(target_restaurant_id uuid, order_customer_name text, order_customer_phone text, order_fulfilment_type text, order_car_plate_number text, order_car_description text, order_table_number text, order_delivery_area text, order_delivery_address text, order_delivery_latitude numeric, order_delivery_longitude numeric, order_delivery_google_maps_url text, order_delivery_place_id text, order_delivery_address_text text, order_delivery_landmark text, order_notes text, order_payment_method text, order_items jsonb, order_subtotal numeric, order_delivery_fee numeric, order_total numeric, order_whatsapp_message text, order_consent_processing boolean, order_consent_marketing boolean, order_consent_timestamp timestamp with time zone, order_submission_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  key_id uuid;
  existing_order_id uuid;
  new_order_id uuid;
begin
  if nullif(trim(order_submission_token), '') is null
     or length(order_submission_token) > 100 then
    raise exception 'A valid order submission token is required';
  end if;

  if not exists (
    select 1
    from public.restaurants
    where id = target_restaurant_id
      and is_active = true
      and accepting_orders = true
      and public.is_restaurant_open_at(opening_hours_enabled, opening_hours)
      and status in ('live', 'trial', 'paid')
  ) then
    raise exception 'Restaurant is not accepting orders';
  end if;

  insert into public.order_submission_keys (restaurant_id, submission_token)
  values (target_restaurant_id, order_submission_token)
  on conflict (restaurant_id, submission_token) do nothing
  returning id into key_id;

  if key_id is null then
    select order_id
    into existing_order_id
    from public.order_submission_keys
    where restaurant_id = target_restaurant_id
      and submission_token = order_submission_token;

    if existing_order_id is not null then
      return existing_order_id;
    end if;

    raise exception 'This order submission is already being processed';
  end if;

  new_order_id := public.create_order_with_customer_v2(
    target_restaurant_id,
    order_customer_name,
    order_customer_phone,
    order_fulfilment_type,
    order_car_plate_number,
    order_car_description,
    order_table_number,
    order_delivery_area,
    order_delivery_address,
    order_delivery_latitude,
    order_delivery_longitude,
    order_delivery_google_maps_url,
    order_delivery_place_id,
    order_delivery_address_text,
    order_delivery_landmark,
    order_notes,
    order_payment_method,
    order_items,
    order_subtotal,
    order_delivery_fee,
    order_total,
    order_whatsapp_message,
    order_consent_processing,
    order_consent_marketing,
    order_consent_timestamp
  );

  update public.order_submission_keys
  set order_id = new_order_id
  where id = key_id;

  update public.customers customer
  set
    total_orders = (
      select count(*)::integer
      from public.orders order_row
      where order_row.restaurant_id = customer.restaurant_id
        and order_row.customer_phone = customer.phone
        and order_row.status = 'Completed'
    ),
    total_spend = coalesce((
      select sum(order_row.total)
      from public.orders order_row
      where order_row.restaurant_id = customer.restaurant_id
        and order_row.customer_phone = customer.phone
        and order_row.status = 'Completed'
    ), 0),
    last_order_at = (
      select max(order_row.created_at)
      from public.orders order_row
      where order_row.restaurant_id = customer.restaurant_id
        and order_row.customer_phone = customer.phone
        and order_row.status = 'Completed'
    )
  where customer.restaurant_id = target_restaurant_id
    and customer.phone = order_customer_phone;

  return new_order_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_order_with_customer_v4(target_restaurant_id uuid, order_customer_name text, order_customer_phone text, order_fulfilment_type text, order_car_plate_number text, order_car_description text, order_table_number text, order_delivery_area text, order_delivery_address text, order_delivery_latitude numeric, order_delivery_longitude numeric, order_delivery_google_maps_url text, order_delivery_place_id text, order_delivery_address_text text, order_delivery_landmark text, order_notes text, order_payment_method text, order_items jsonb, order_subtotal numeric, order_delivery_fee numeric, order_total numeric, order_whatsapp_message text, order_consent_processing boolean, order_consent_marketing boolean, order_consent_timestamp timestamp with time zone, order_submission_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  canonical_phone text := public.normalize_customer_phone(order_customer_phone);
  created_order_id uuid;
begin
  if length(canonical_phone) < 7 or length(canonical_phone) > 15 then
    raise exception 'A valid canonical customer phone is required';
  end if;

  created_order_id := public.create_order_with_customer_v3(
    target_restaurant_id,
    order_customer_name,
    canonical_phone,
    order_fulfilment_type,
    order_car_plate_number,
    order_car_description,
    order_table_number,
    order_delivery_area,
    order_delivery_address,
    order_delivery_latitude,
    order_delivery_longitude,
    order_delivery_google_maps_url,
    order_delivery_place_id,
    order_delivery_address_text,
    order_delivery_landmark,
    order_notes,
    order_payment_method,
    order_items,
    order_subtotal,
    order_delivery_fee,
    order_total,
    order_whatsapp_message,
    order_consent_processing,
    order_consent_marketing,
    order_consent_timestamp,
    order_submission_token
  );

  update public.customers
  set
    marketing_opt_in = order_consent_marketing,
    consent_marketing = order_consent_marketing,
    consent_timestamp = order_consent_timestamp,
    marketing_consent_updated_at = order_consent_timestamp,
    marketing_consent_source = 'checkout',
    marketing_consent_withdrawn_at =
      case when order_consent_marketing then null else order_consent_timestamp end
  where restaurant_id = target_restaurant_id
    and phone = canonical_phone;

  insert into public.order_status_events (
    restaurant_id,
    order_id,
    from_status,
    to_status,
    actor_role,
    reason
  )
  select
    target_restaurant_id,
    created_order_id,
    null,
    'New',
    'customer',
    'order_created'
  where not exists (
    select 1
    from public.order_status_events
    where restaurant_id = target_restaurant_id
      and order_id = created_order_id
      and reason = 'order_created'
  );

  return created_order_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_restaurant(target_slug text)
 RETURNS TABLE(id uuid, name text, name_ar text, slug text, logo_url text, cover_image_url text, whatsapp_number text, address text, city text, subtitle text, address_ar text, subtitle_ar text, delivery_fee numeric, minimum_order_amount numeric, pickup_enabled boolean, car_pickup_enabled boolean, dine_in_enabled boolean, delivery_enabled boolean, scheduled_orders_enabled boolean, public_reviews_enabled boolean, accepting_orders boolean, opening_hours_enabled boolean, opening_hours jsonb, latitude double precision, longitude double precision, delivery_radius_km numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    restaurant.id,
    restaurant.name,
    restaurant.name_ar,
    restaurant.slug,
    restaurant.logo_url,
    restaurant.cover_image_url,
    restaurant.whatsapp_number,
    restaurant.address,
    restaurant.city,
    restaurant.subtitle,
    restaurant.address_ar,
    restaurant.subtitle_ar,
    restaurant.delivery_fee,
    restaurant.minimum_order_amount,
    restaurant.pickup_enabled,
    restaurant.car_pickup_enabled,
    restaurant.dine_in_enabled,
    restaurant.delivery_enabled,
    restaurant.scheduled_orders_enabled,
    restaurant.public_reviews_enabled,
    restaurant.accepting_orders,
    restaurant.opening_hours_enabled,
    restaurant.opening_hours,
    restaurant.latitude,
    restaurant.longitude,
    restaurant.delivery_radius_km
  from public.restaurants restaurant
  where restaurant.slug = trim(target_slug)
    and public.is_public_restaurant(restaurant.id)
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_restaurant_commission_kept(target_restaurant_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with boundaries as (
    select
      date_trunc('month', now() at time zone 'Asia/Dubai') at time zone 'Asia/Dubai'
        as month_start
  ),
  delivery_orders as (
    select
      orders.created_at,
      coalesce(orders.subtotal, 0) as base
    from public.orders
    where orders.restaurant_id = target_restaurant_id
      and orders.fulfilment_type = 'delivery'
      and orders.status = 'Completed'
  ),
  metrics as (
    select
      count(*) filter (
        where delivery_orders.created_at >= boundaries.month_start
      )::integer as month_orders,
      coalesce(sum(delivery_orders.base) filter (
        where delivery_orders.created_at >= boundaries.month_start
      ), 0) as month_base,
      count(*)::integer as all_time_orders,
      coalesce(sum(delivery_orders.base), 0) as all_time_base
    from delivery_orders
    cross join boundaries
  )
  select jsonb_build_object(
    'monthOrders', metrics.month_orders,
    'monthBase', metrics.month_base,
    'allTimeOrders', metrics.all_time_orders,
    'allTimeBase', metrics.all_time_base
  )
  from metrics;
$function$
;

CREATE OR REPLACE FUNCTION public.get_restaurant_dashboard_analytics(target_restaurant_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with boundaries as (
    select
      date_trunc('day', now() at time zone 'Asia/Dubai') at time zone 'Asia/Dubai'
        as today_start,
      (date_trunc('day', now() at time zone 'Asia/Dubai') + interval '1 day')
        at time zone 'Asia/Dubai' as tomorrow_start
  ),
  order_metrics as (
    select
      count(*) filter (
        where orders.created_at >= boundaries.today_start
          and orders.created_at < boundaries.tomorrow_start
      )::integer as todays_orders,
      coalesce(sum(orders.total) filter (
        where orders.status = 'Completed'
          and orders.created_at >= boundaries.today_start
          and orders.created_at < boundaries.tomorrow_start
      ), 0) as todays_revenue,
      count(*) filter (where orders.status = 'New')::integer as new_orders,
      count(*) filter (where orders.status = 'Completed')::integer as completed_orders,
      coalesce(avg(orders.total) filter (where orders.status = 'Completed'), 0)
        as average_order_value
    from public.orders
    cross join boundaries
    where orders.restaurant_id = target_restaurant_id
  ),
  repeat_metrics as (
    select count(*)::integer as repeat_customers
    from public.customers
    where restaurant_id = target_restaurant_id
      and total_orders > 1
  ),
  item_metrics as (
    select
      coalesce(item ->> 'name', 'Unknown item') as item_name,
      sum(coalesce((item ->> 'quantity')::integer, 0)) as quantity
    from public.orders,
      lateral jsonb_array_elements(orders.items) item
    where orders.restaurant_id = target_restaurant_id
      and orders.status = 'Completed'
    group by coalesce(item ->> 'name', 'Unknown item')
    order by quantity desc, item_name
    limit 1
  )
  select jsonb_build_object(
    'todaysOrders', order_metrics.todays_orders,
    'todaysRevenue', order_metrics.todays_revenue,
    'newOrders', order_metrics.new_orders,
    'completedOrders', order_metrics.completed_orders,
    'repeatCustomers', repeat_metrics.repeat_customers,
    'averageOrderValue', order_metrics.average_order_value,
    'topSellingItem', coalesce(item_metrics.item_name, 'No sales yet')
  )
  from order_metrics
  cross join repeat_metrics
  left join item_metrics on true;
$function$
;

CREATE OR REPLACE FUNCTION public.get_super_admin_restaurant_summaries()
 RETURNS TABLE(restaurant_id uuid, orders_count bigint, customers_count bigint, onboarding_completed bigint, onboarding_total bigint, last_order_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    restaurant.id,
    (select count(*) from public.orders where orders.restaurant_id = restaurant.id),
    (select count(*) from public.customers where customers.restaurant_id = restaurant.id),
    (
      select count(*)
      from public.onboarding_tasks
      where onboarding_tasks.restaurant_id = restaurant.id
        and onboarding_tasks.is_completed = true
    ),
    (
      select count(*)
      from public.onboarding_tasks
      where onboarding_tasks.restaurant_id = restaurant.id
    ),
    (
      select max(orders.created_at)
      from public.orders
      where orders.restaurant_id = restaurant.id
    )
  from public.restaurants restaurant;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    'restaurant_admin'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_public_restaurant(target_restaurant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.restaurants
    where id = target_restaurant_id
      and is_active = true
      and status in ('live', 'trial', 'paid')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_restaurant_member(target_restaurant_id uuid, allowed_roles text[] DEFAULT NULL::text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.restaurant_users
    where restaurant_users.restaurant_id = target_restaurant_id
      and restaurant_users.user_id = auth.uid()
      and restaurant_users.accepted_at is not null
      and (
        allowed_roles is null
        or restaurant_users.role = any(allowed_roles)
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_restaurant_open_at(schedule_enabled boolean, schedule jsonb, checked_at timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  day_keys text[] := array[
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  ];
  local_time timestamp := checked_at at time zone 'Asia/Dubai';
  day_index integer := extract(isodow from local_time)::integer;
  current_minutes integer :=
    extract(hour from local_time)::integer * 60 + extract(minute from local_time)::integer;
  current_day jsonb;
  previous_day jsonb;
  opens integer;
  closes integer;
begin
  if schedule_enabled is not true then
    return true;
  end if;

  current_day := coalesce(schedule -> day_keys[day_index], '{}'::jsonb);
  if coalesce((current_day ->> 'closed')::boolean, true) is false then
    opens := split_part(current_day ->> 'open', ':', 1)::integer * 60
      + split_part(current_day ->> 'open', ':', 2)::integer;
    closes := split_part(current_day ->> 'close', ':', 1)::integer * 60
      + split_part(current_day ->> 'close', ':', 2)::integer;

    if opens = closes
       or (closes > opens and current_minutes >= opens and current_minutes < closes)
       or (closes < opens and current_minutes >= opens) then
      return true;
    end if;
  end if;

  previous_day := coalesce(
    schedule -> day_keys[case when day_index = 1 then 7 else day_index - 1 end],
    '{}'::jsonb
  );
  if coalesce((previous_day ->> 'closed')::boolean, true) is false then
    opens := split_part(previous_day ->> 'open', ':', 1)::integer * 60
      + split_part(previous_day ->> 'open', ':', 2)::integer;
    closes := split_part(previous_day ->> 'close', ':', 1)::integer * 60
      + split_part(previous_day ->> 'close', ':', 2)::integer;

    if closes < opens and current_minutes < closes then
      return true;
    end if;
  end if;

  return false;
exception
  when others then
    return false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from profiles
    where profiles.id = auth.uid()
      and profiles.role = 'super_admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_customer_phone(input_phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when regexp_replace(coalesce(input_phone, ''), '[^0-9]', '', 'g') like '00%'
      then substring(regexp_replace(input_phone, '[^0-9]', '', 'g') from 3)
    when regexp_replace(coalesce(input_phone, ''), '[^0-9]', '', 'g') like '05%'
      and length(regexp_replace(input_phone, '[^0-9]', '', 'g')) = 10
      then '971' || substring(regexp_replace(input_phone, '[^0-9]', '', 'g') from 2)
    when regexp_replace(coalesce(input_phone, ''), '[^0-9]', '', 'g') like '5%'
      and length(regexp_replace(input_phone, '[^0-9]', '', 'g')) = 9
      then '971' || regexp_replace(input_phone, '[^0-9]', '', 'g')
    else regexp_replace(coalesce(input_phone, ''), '[^0-9]', '', 'g')
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.open_restaurant_shift(target_restaurant_id uuid, requested_shift_name text, requested_opening_cash_amount numeric, requested_opening_note text, event_actor_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor_role text;
  created_shift_id uuid;
begin
  actor_role := public.shift_actor_role(
    target_restaurant_id,
    event_actor_user_id
  );

  if actor_role is null then
    raise exception 'Shift access denied';
  end if;

  if nullif(trim(requested_shift_name), '') is null
     or char_length(trim(requested_shift_name)) > 80 then
    raise exception 'Shift name is required and must be 80 characters or fewer';
  end if;

  if requested_opening_cash_amount is null
     or requested_opening_cash_amount < 0 then
    raise exception 'Opening cash cannot be negative';
  end if;

  insert into public.restaurant_shifts (
    restaurant_id,
    shift_name,
    opening_cash_amount,
    opening_note,
    opened_by_user_id
  )
  values (
    target_restaurant_id,
    trim(requested_shift_name),
    round(requested_opening_cash_amount, 2),
    nullif(left(trim(requested_opening_note), 500), ''),
    event_actor_user_id
  )
  returning id into created_shift_id;

  return created_shift_id;
exception
  when unique_violation then
    raise exception 'This restaurant already has an open shift';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_order_print_event(target_restaurant_id uuid, target_order_id uuid, target_print_kind text, event_actor_user_id uuid, event_actor_role text, event_device_label text, event_is_reprint boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  event_id uuid;
begin
  if target_print_kind not in ('kot', 'receipt') then
    raise exception 'Invalid print kind';
  end if;

  if not exists (
    select 1
    from public.orders
    where id = target_order_id
      and restaurant_id = target_restaurant_id
  ) then
    raise exception 'Order not found';
  end if;

  insert into public.order_print_events (
    restaurant_id,
    order_id,
    print_kind,
    actor_user_id,
    actor_role,
    device_label,
    is_reprint
  )
  values (
    target_restaurant_id,
    target_order_id,
    target_print_kind,
    event_actor_user_id,
    nullif(trim(event_actor_role), ''),
    nullif(left(trim(event_device_label), 160), ''),
    event_is_reprint
  )
  returning id into event_id;

  return event_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.shift_actor_role(target_restaurant_id uuid, target_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role
  from public.restaurant_users
  where restaurant_id = target_restaurant_id
    and user_id = target_user_id
    and accepted_at is not null
    and role in ('restaurant_admin', 'owner', 'manager', 'staff')
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.transition_order_status_and_award_loyalty(target_restaurant_id uuid, target_order_id uuid, target_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  order_record public.orders%rowtype;
  expected_status text;
  customer_record public.customers%rowtype;
  earned_points integer;
  loyalty_transaction_id uuid;
begin
  select *
  into order_record
  from public.orders
  where id = target_order_id
    and restaurant_id = target_restaurant_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  expected_status := case
    when order_record.status = 'New' then 'Accepted'
    when order_record.status = 'Accepted' then 'Preparing'
    when order_record.status = 'Preparing' and order_record.fulfilment_type = 'delivery'
      then 'Out for Delivery'
    when order_record.status = 'Preparing' and order_record.fulfilment_type = 'dine_in'
      then 'Ready to Serve'
    when order_record.status = 'Preparing' then 'Completed'
    when order_record.status in ('Ready to Serve', 'Out for Delivery') then 'Completed'
    else null
  end;

  if target_status = 'Cancelled' then
    if order_record.status in ('Completed', 'Cancelled') then
      raise exception 'This order cannot be cancelled';
    end if;
  elsif expected_status is null or target_status <> expected_status then
    raise exception 'Invalid order status transition';
  end if;

  update public.orders
  set status = target_status::public.order_status
  where id = target_order_id
    and restaurant_id = target_restaurant_id;

  if target_status = 'Completed' then
    earned_points := greatest(0, floor(order_record.total)::integer);

    select *
    into customer_record
    from public.customers
    where restaurant_id = target_restaurant_id
      and phone = order_record.customer_phone
    for update;

    if found and earned_points > 0 then
      insert into public.loyalty_transactions (
        restaurant_id,
        customer_id,
        order_id,
        type,
        points,
        description
      )
      values (
        target_restaurant_id,
        customer_record.id,
        target_order_id,
        'earned',
        earned_points,
        'Earned ' || earned_points || ' points for completed order'
      )
      on conflict (order_id) where type = 'earned' and order_id is not null
      do nothing
      returning id into loyalty_transaction_id;

      if loyalty_transaction_id is not null then
        update public.customers
        set
          loyalty_points_balance = loyalty_points_balance + earned_points,
          lifetime_points_earned = lifetime_points_earned + earned_points
        where id = customer_record.id
          and restaurant_id = target_restaurant_id;

        update public.orders
        set points_earned = earned_points
        where id = target_order_id
          and restaurant_id = target_restaurant_id;
      end if;
    end if;
  end if;

  update public.customers customer
  set
    total_orders = (
      select count(*)::integer
      from public.orders order_row
      where order_row.restaurant_id = customer.restaurant_id
        and order_row.customer_phone = customer.phone
        and order_row.status = 'Completed'
    ),
    total_spend = coalesce((
      select sum(order_row.total)
      from public.orders order_row
      where order_row.restaurant_id = customer.restaurant_id
        and order_row.customer_phone = customer.phone
        and order_row.status = 'Completed'
    ), 0),
    last_order_at = (
      select max(order_row.created_at)
      from public.orders order_row
      where order_row.restaurant_id = customer.restaurant_id
        and order_row.customer_phone = customer.phone
        and order_row.status = 'Completed'
    )
  where customer.restaurant_id = target_restaurant_id
    and customer.phone = order_record.customer_phone;

  return target_order_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transition_order_status_and_record_event(target_restaurant_id uuid, target_order_id uuid, target_status text, event_actor_user_id uuid, event_actor_role text, event_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  previous_status public.order_status;
  updated_order_id uuid;
  active_shift_id uuid;
begin
  if target_status = 'Completed' then
    select id
    into active_shift_id
    from public.restaurant_shifts
    where restaurant_id = target_restaurant_id
      and status = 'open'
    for update;
  end if;

  select status
  into previous_status
  from public.orders
  where id = target_order_id
    and restaurant_id = target_restaurant_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  updated_order_id := public.transition_order_status_and_award_loyalty(
    target_restaurant_id,
    target_order_id,
    target_status
  );

  if target_status = 'Completed' and active_shift_id is not null then
    update public.orders
    set shift_id = active_shift_id
    where id = target_order_id
      and restaurant_id = target_restaurant_id
      and shift_id is null;
  end if;

  insert into public.order_status_events (
    restaurant_id,
    order_id,
    from_status,
    to_status,
    actor_user_id,
    actor_role,
    reason
  )
  values (
    target_restaurant_id,
    target_order_id,
    previous_status,
    target_status::public.order_status,
    event_actor_user_id,
    nullif(trim(event_actor_role), ''),
    nullif(trim(event_reason), '')
  );

  return updated_order_id;
end;
$function$
;


-- =============================================================
-- TRIGGERS
-- =============================================================

CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER menu_categories_set_updated_at BEFORE UPDATE ON public.menu_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER menu_items_set_updated_at BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER menu_offers_set_updated_at BEFORE UPDATE ON public.menu_offers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER onboarding_tasks_set_updated_at BEFORE UPDATE ON public.onboarding_tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER restaurant_shifts_set_updated_at BEFORE UPDATE ON public.restaurant_shifts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER restaurants_set_updated_at BEFORE UPDATE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION set_updated_at();

import type { OpeningHours } from "@/lib/opening-hours";

export type PaymentMethod = "Cash on Delivery" | "Card on Delivery";
export type FulfilmentType = "delivery" | "takeaway" | "car_pickup" | "dine_in";

export type UserRole = "super_admin" | "restaurant_admin" | "staff";

export type RestaurantStatus =
  | "draft"
  | "onboarding"
  | "live"
  | "trial"
  | "paid"
  | "paused"
  | "cancelled";

export type RestaurantPlan = "trial" | "starter" | "growth" | "pro" | "custom";

export type OrderStatus =
  | "New"
  | "Accepted"
  | "Preparing"
  | "Ready to Serve"
  | "Out for Delivery"
  | "Completed"
  | "Cancelled";

export type PublicRestaurant = {
  id: string;
  name: string;
  name_ar?: string | null;
  slug: string;
  logo_url: string | null;
  cover_image_url?: string | null;
  whatsapp_number: string;
  address: string | null;
  city?: string | null;
  subtitle?: string | null;
  address_ar?: string | null;
  subtitle_ar?: string | null;
  delivery_fee: number;
  minimum_order_amount: number;
  pickup_enabled?: boolean;
  car_pickup_enabled?: boolean;
  dine_in_enabled?: boolean;
  delivery_enabled?: boolean;
  scheduled_orders_enabled?: boolean;
  public_reviews_enabled?: boolean;
  accepting_orders?: boolean;
  opening_hours_enabled?: boolean;
  opening_hours?: OpeningHours | null;
};

export type Restaurant = PublicRestaurant & {
  owner_name?: string | null;
  owner_email?: string | null;
  owner_phone?: string | null;
  status?: RestaurantStatus;
  plan?: RestaurantPlan;
  internal_notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
};

export type MenuCategory = {
  id: string;
  restaurant_id: string;
  name: string;
  name_ar?: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
};

export type MenuItem = {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  name_ar?: string | null;
  description: string | null;
  description_ar?: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at?: string;
};

export type MenuOffer = {
  id: string;
  restaurant_id: string;
  menu_item_id: string;
  title: string;
  title_ar: string | null;
  description: string | null;
  description_ar: string | null;
  promotional_price: number;
  max_quantity_per_order: number;
  starts_at: string | null;
  ends_at: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CartLine = {
  item_id: string;
  offer_id?: string | null;
  offer_max_quantity?: number | null;
  name: string;
  name_ar?: string | null;
  price: number;
  quantity: number;
};

export type OrderItem = CartLine;

export type Order = {
  id: string;
  restaurant_id: string;
  shift_id: string | null;
  customer_name: string;
  customer_phone: string;
  fulfilment_type: FulfilmentType;
  car_plate_number: string | null;
  car_description: string | null;
  table_number: string | null;
  delivery_area: string | null;
  delivery_address: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  delivery_google_maps_url: string | null;
  delivery_place_id: string | null;
  delivery_address_text: string | null;
  delivery_landmark: string | null;
  notes: string | null;
  payment_method: PaymentMethod | null;
  items: OrderItem[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  points_earned: number;
  points_redeemed: number;
  loyalty_discount: number;
  status: OrderStatus;
  source?: "customer" | "staff";
  whatsapp_message: string;
  consent_order_processing: boolean;
  consent_marketing: boolean;
  consent_timestamp: string;
  created_at: string;
  updated_at: string;
};

export type ShiftStatus = "open" | "closed";

export type ShiftFulfilmentSummary = Partial<
  Record<FulfilmentType, { orders: number; sales: number }>
>;

export type ShiftSummary = {
  completed_order_count: number;
  completed_sales: number;
  completed_cash_order_total: number;
  card_on_delivery_total: number;
  cash_paid_out_total: number;
  cancelled_order_count: number;
  fulfilment_breakdown: ShiftFulfilmentSummary;
  expected_cash_amount: number;
};

export type RestaurantShift = {
  id: string;
  restaurant_id: string;
  shift_name: string;
  status: ShiftStatus;
  opening_cash_amount: number;
  cash_counted_amount: number | null;
  completed_order_count: number;
  completed_sales: number;
  completed_cash_order_total: number;
  card_on_delivery_total: number;
  cash_paid_out_total: number;
  cancelled_order_count: number;
  fulfilment_breakdown: ShiftFulfilmentSummary;
  expected_cash_amount: number | null;
  difference_amount: number | null;
  opened_by_user_id: string;
  closed_by_user_id: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_note: string | null;
  closing_note: string | null;
  created_at: string;
  updated_at: string;
};

export type ShiftCashPaidOut = {
  id: string;
  restaurant_id: string;
  shift_id: string;
  amount: number;
  reason: string;
  recorded_by_user_id: string;
  recorded_at: string;
};

export type Customer = {
  id: string;
  restaurant_id: string;
  name: string;
  phone: string;
  delivery_area: string;
  delivery_address: string;
  default_latitude: number | null;
  default_longitude: number | null;
  default_google_maps_url: string | null;
  default_address_text: string | null;
  default_landmark: string | null;
  total_orders: number;
  total_spend: number;
  last_order_at: string | null;
  marketing_opt_in: boolean;
  consent_order_processing: boolean;
  consent_marketing: boolean;
  consent_timestamp: string | null;
  marketing_consent_updated_at?: string | null;
  marketing_consent_source?: string | null;
  marketing_consent_withdrawn_at?: string | null;
  loyalty_points_balance: number;
  lifetime_points_earned: number;
  created_at: string;
  updated_at: string;
};

export type LoyaltyTransaction = {
  id: string;
  restaurant_id: string;
  customer_id: string;
  order_id: string | null;
  type: "earned" | "redeemed" | "adjusted" | "expired";
  points: number;
  description: string | null;
  created_at: string;
};

export type FeedbackModerationStatus = "pending" | "approved" | "hidden";

export type CustomerFeedback = {
  id: string;
  restaurant_id: string;
  order_id: string;
  rating: number;
  tags: string[];
  comment: string | null;
  customer_display_name: string;
  is_verified_order: boolean;
  moderation_status: FeedbackModerationStatus;
  restaurant_response: string | null;
  submitted_at: string;
  published_at: string | null;
};

export type PublicFeedbackSummary = {
  averageRating: number | null;
  reviewCount: number;
  reviews: CustomerFeedback[];
};

export type RestaurantUser = {
  id: string;
  restaurant_id: string;
  user_id: string | null;
  email: string;
  role: UserRole | "owner" | "manager";
  invited_at?: string | null;
  accepted_at?: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

export type OnboardingTask = {
  id: string;
  restaurant_id: string;
  task_key: string;
  task_label: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SuperAdminRestaurant = Restaurant & {
  orders_count: number;
  customers_count: number;
  onboarding_completed: number;
  onboarding_total: number;
  last_order_at: string | null;
};

export type MenuWithCategories = {
  categories: MenuCategory[];
  items: MenuItem[];
};

export type Analytics = {
  todaysOrders: number;
  todaysRevenue: number;
  newOrders: number;
  completedOrders: number;
  repeatCustomers: number;
  averageOrderValue: number;
  topSellingItem: string;
};

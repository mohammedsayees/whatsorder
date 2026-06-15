export type PaymentMethod = "Cash on Delivery" | "Card on Delivery";

export type OrderStatus =
  | "New"
  | "Accepted"
  | "Preparing"
  | "Out for Delivery"
  | "Completed"
  | "Cancelled";

export type Restaurant = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  whatsapp_number: string;
  address: string | null;
  delivery_fee: number;
  minimum_order_amount: number;
  is_active: boolean;
  created_at: string;
};

export type MenuCategory = {
  id: string;
  restaurant_id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
};

export type MenuItem = {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  created_at: string;
};

export type CartLine = {
  item_id: string;
  name: string;
  price: number;
  quantity: number;
};

export type OrderItem = CartLine;

export type Order = {
  id: string;
  restaurant_id: string;
  customer_name: string;
  customer_phone: string;
  delivery_area: string;
  delivery_address: string;
  notes: string | null;
  payment_method: PaymentMethod;
  items: OrderItem[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  status: OrderStatus;
  whatsapp_message: string;
  consent_order_processing: boolean;
  consent_marketing: boolean;
  consent_timestamp: string;
  created_at: string;
  updated_at: string;
};

export type Customer = {
  id: string;
  restaurant_id: string;
  name: string;
  phone: string;
  delivery_area: string;
  delivery_address: string;
  total_orders: number;
  total_spend: number;
  marketing_opt_in: boolean;
  created_at: string;
  updated_at: string;
};

export type RestaurantUser = {
  id: string;
  restaurant_id: string;
  email: string;
  role: "owner" | "manager" | "staff";
  created_at: string;
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

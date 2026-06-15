import type { Customer, MenuCategory, MenuItem, Order, Restaurant } from "@/lib/types";

const now = new Date().toISOString();

export const demoRestaurant: Restaurant = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Chaixpress",
  slug: "chaixpress",
  logo_url: null,
  whatsapp_number: process.env.NEXT_PUBLIC_DEMO_WHATSAPP_NUMBER ?? "971554822424",
  address: "Al Nahda, Dubai, UAE",
  delivery_fee: 5,
  minimum_order_amount: 15,
  is_active: true,
  created_at: now
};

export const demoCategories: MenuCategory[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    restaurant_id: demoRestaurant.id,
    name: "Tea & Drinks",
    display_order: 1,
    is_active: true,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    restaurant_id: demoRestaurant.id,
    name: "Burgers",
    display_order: 2,
    is_active: true,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    restaurant_id: demoRestaurant.id,
    name: "Rolls & Fries",
    display_order: 3,
    is_active: true,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    restaurant_id: demoRestaurant.id,
    name: "Combos",
    display_order: 4,
    is_active: true,
    created_at: now
  }
];

export const demoItems: MenuItem[] = [
  {
    id: "00000000-0000-4000-8000-000000000201",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[0].id,
    name: "Karak Tea",
    description: "Signature hot karak tea.",
    price: 1,
    image_url: null,
    is_available: true,
    is_featured: true,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000202",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[1].id,
    name: "Zinger Burger",
    description: "Crispy zinger chicken burger with house sauce.",
    price: 15,
    image_url: null,
    is_available: true,
    is_featured: true,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000203",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[1].id,
    name: "Double Smash Burger",
    description: "Double smashed beef patty burger with cheese.",
    price: 21,
    image_url: null,
    is_available: true,
    is_featured: true,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000204",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[1].id,
    name: "Single Smash Burger",
    description: "Single smashed beef patty burger with cheese.",
    price: 15,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000205",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[1].id,
    name: "Grill Chicken Burger",
    description: "Grilled chicken burger with fresh toppings.",
    price: 15,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000206",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[2].id,
    name: "Classic Porotta Roll",
    description: "Classic porotta roll with house filling.",
    price: 7,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000207",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[2].id,
    name: "Oman Chips Porotta",
    description: "Porotta filled with Oman Chips.",
    price: 3,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000208",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[2].id,
    name: "Chicken Loaded Fries",
    description: "Loaded fries topped with chicken and sauce.",
    price: 16,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000209",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[0].id,
    name: "Fresh Lime Juice",
    description: "Chilled fresh lime juice.",
    price: 8,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000210",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[3].id,
    name: "Zinger Combo",
    description: "Zinger burger combo meal.",
    price: 21,
    image_url: null,
    is_available: true,
    is_featured: true,
    created_at: now
  }
];

export const demoOrders: Order[] = [
  {
    id: "WO-DEMO-1001",
    restaurant_id: demoRestaurant.id,
    customer_name: "Aisha Khan",
    customer_phone: "0501234567",
    delivery_area: "Al Nahda",
    delivery_address: "Tower B, Flat 904",
    notes: "Extra sauce",
    payment_method: "Cash on Delivery",
    items: [
      { item_id: demoItems[1].id, name: "Zinger Burger", price: 15, quantity: 1 },
      { item_id: demoItems[0].id, name: "Karak Tea", price: 1, quantity: 2 }
    ],
    subtotal: 17,
    delivery_fee: 5,
    total: 22,
    status: "New",
    whatsapp_message: "",
    consent_order_processing: true,
    consent_marketing: true,
    consent_timestamp: now,
    created_at: now,
    updated_at: now
  },
  {
    id: "WO-DEMO-1002",
    restaurant_id: demoRestaurant.id,
    customer_name: "Rahul Nair",
    customer_phone: "0559876543",
    delivery_area: "Qusais",
    delivery_address: "Near Metro Station",
    notes: null,
    payment_method: "Card on Delivery",
    items: [{ item_id: demoItems[9].id, name: "Zinger Combo", price: 21, quantity: 1 }],
    subtotal: 21,
    delivery_fee: 5,
    total: 26,
    status: "Completed",
    whatsapp_message: "",
    consent_order_processing: true,
    consent_marketing: false,
    consent_timestamp: now,
    created_at: now,
    updated_at: now
  }
];

export const demoCustomers: Customer[] = [
  {
    id: "00000000-0000-4000-8000-000000000301",
    restaurant_id: demoRestaurant.id,
    name: "Aisha Khan",
    phone: "0501234567",
    delivery_area: "Al Nahda",
    delivery_address: "Tower B, Flat 904",
    total_orders: 3,
    total_spend: 74,
    marketing_opt_in: true,
    created_at: now,
    updated_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000302",
    restaurant_id: demoRestaurant.id,
    name: "Rahul Nair",
    phone: "0559876543",
    delivery_area: "Qusais",
    delivery_address: "Near Metro Station",
    total_orders: 1,
    total_spend: 17,
    marketing_opt_in: false,
    created_at: now,
    updated_at: now
  }
];

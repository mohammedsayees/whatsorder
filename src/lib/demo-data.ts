import type { Customer, MenuCategory, MenuItem, Order, Restaurant } from "@/lib/types";

const now = new Date().toISOString();

export const demoRestaurant: Restaurant = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Chai Xpress",
  slug: "chaixpress",
  logo_url: null,
  whatsapp_number: process.env.NEXT_PUBLIC_DEMO_WHATSAPP_NUMBER ?? "971551150068",
  address: "Al Rawda 3, Ajman, UAE",
  delivery_fee: 5,
  minimum_order_amount: 15,
  is_active: true,
  created_at: now
};

export const demoCategories: MenuCategory[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    restaurant_id: demoRestaurant.id,
    name: "Tea & Hot Drinks",
    display_order: 1,
    is_active: true,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    restaurant_id: demoRestaurant.id,
    name: "Shawarma",
    display_order: 2,
    is_active: true,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    restaurant_id: demoRestaurant.id,
    name: "Burgers",
    display_order: 3,
    is_active: true,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    restaurant_id: demoRestaurant.id,
    name: "Sandwiches & Rolls",
    display_order: 4,
    is_active: true,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000105",
    restaurant_id: demoRestaurant.id,
    name: "Snacks",
    display_order: 5,
    is_active: true,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000106",
    restaurant_id: demoRestaurant.id,
    name: "Juices",
    display_order: 6,
    is_active: true,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000107",
    restaurant_id: demoRestaurant.id,
    name: "Combos",
    display_order: 7,
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
    price: 2,
    image_url: null,
    is_available: true,
    is_featured: true,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000202",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[0].id,
    name: "Sulaimani Tea",
    description: "Light black tea served hot.",
    price: 1,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000203",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[0].id,
    name: "Ginger Tea",
    description: "Hot tea with ginger.",
    price: 2,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000204",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[0].id,
    name: "Zafran Tea",
    description: "Saffron-flavoured hot tea.",
    price: 3,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000205",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[1].id,
    name: "Chicken Shawarma",
    description: "Classic chicken shawarma wrap.",
    price: 6,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000206",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[1].id,
    name: "Spicy Chicken Shawarma",
    description: "Chicken shawarma with spicy sauce.",
    price: 7,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000207",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[1].id,
    name: "Shawarma Plate",
    description: "Chicken shawarma served as a plate.",
    price: 15,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000208",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[2].id,
    name: "Zinger Burger",
    description: "Crispy zinger chicken burger with house sauce.",
    price: 12,
    image_url: null,
    is_available: true,
    is_featured: true,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000209",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[2].id,
    name: "Chicken Burger",
    description: "Classic chicken burger.",
    price: 8,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000210",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[2].id,
    name: "Beef Burger",
    description: "Classic beef burger.",
    price: 10,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000211",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[2].id,
    name: "Double Zinger Burger",
    description: "Double crispy zinger chicken burger.",
    price: 16,
    image_url: null,
    is_available: true,
    is_featured: true,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000212",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[3].id,
    name: "Porotta Roll",
    description: "Classic porotta roll with house filling.",
    price: 7,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000213",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[3].id,
    name: "Oman Chips Porotta",
    description: "Porotta filled with Oman Chips.",
    price: 5,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000214",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[3].id,
    name: "Chicken Club Sandwich",
    description: "Layered chicken club sandwich.",
    price: 12,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000215",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[4].id,
    name: "Loaded Fries",
    description: "Fries topped with chicken, cheese, and sauce.",
    price: 12,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000216",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[4].id,
    name: "French Fries",
    description: "Crispy fried potato fries.",
    price: 6,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000217",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[4].id,
    name: "Chicken Nuggets",
    description: "Crispy chicken nuggets.",
    price: 10,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000218",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[5].id,
    name: "Fresh Lime Juice",
    description: "Chilled fresh lime juice.",
    price: 8,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000219",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[5].id,
    name: "Orange Juice",
    description: "Fresh orange juice.",
    price: 10,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000220",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[5].id,
    name: "Avocado Juice",
    description: "Creamy avocado juice.",
    price: 12,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000221",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[6].id,
    name: "Shawarma + Karak Combo",
    description: "Chicken shawarma with karak tea.",
    price: 7,
    image_url: null,
    is_available: true,
    is_featured: true,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000222",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[6].id,
    name: "Zinger Burger + Fries + Karak",
    description: "Zinger burger combo with fries and karak.",
    price: 18,
    image_url: null,
    is_available: true,
    is_featured: true,
    created_at: now
  },
  {
    id: "00000000-0000-4000-8000-000000000223",
    restaurant_id: demoRestaurant.id,
    category_id: demoCategories[6].id,
    name: "3 Shawarma Offer",
    description: "Three chicken shawarmas.",
    price: 12,
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
    delivery_latitude: 25.291334,
    delivery_longitude: 55.371281,
    delivery_google_maps_url: "https://www.google.com/maps?q=25.291334,55.371281",
    delivery_place_id: null,
    delivery_address_text: "Tower B, Flat 904",
    delivery_landmark: "Near supermarket",
    notes: "Extra sauce",
    payment_method: "Cash on Delivery",
    items: [
      { item_id: demoItems[4].id, name: "Chicken Shawarma", price: 6, quantity: 2 },
      { item_id: demoItems[0].id, name: "Karak Tea", price: 2, quantity: 2 }
    ],
    subtotal: 16,
    delivery_fee: 5,
    total: 21,
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
    delivery_latitude: null,
    delivery_longitude: null,
    delivery_google_maps_url: null,
    delivery_place_id: null,
    delivery_address_text: "Near Metro Station",
    delivery_landmark: "Metro exit 2",
    notes: null,
    payment_method: "Card on Delivery",
    items: [{ item_id: demoItems[21].id, name: "Zinger Burger + Fries + Karak", price: 18, quantity: 1 }],
    subtotal: 18,
    delivery_fee: 5,
    total: 23,
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
    default_latitude: 25.291334,
    default_longitude: 55.371281,
    default_google_maps_url: "https://www.google.com/maps?q=25.291334,55.371281",
    default_address_text: "Tower B, Flat 904",
    default_landmark: "Near supermarket",
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
    default_latitude: null,
    default_longitude: null,
    default_google_maps_url: null,
    default_address_text: "Near Metro Station",
    default_landmark: "Metro exit 2",
    total_orders: 1,
    total_spend: 23,
    marketing_opt_in: false,
    created_at: now,
    updated_at: now
  }
];

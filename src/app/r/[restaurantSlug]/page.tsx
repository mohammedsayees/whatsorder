import { notFound } from "next/navigation";
import { CartProvider } from "@/components/customer/CartProvider";
import { RestaurantMenu } from "@/components/customer/RestaurantMenu";
import {
  getMenu,
  getMenuOffers,
  getMenuOptionCatalog,
  getRestaurantBySlug
} from "@/lib/data";
import { getPublicFeedback } from "@/lib/feedback";
import { loadCustomerContext } from "@/lib/customer-auth/context";
import type {
  CustomerMenuCategory,
  CustomerMenuItem,
  CustomerMenuOffer,
  CustomerMenuOptionCatalog
} from "@/lib/types";

export default async function RestaurantPage({
  params,
  searchParams
}: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ table?: string }>;
}) {
  const [{ restaurantSlug }, query] = await Promise.all([params, searchParams]);
  const tableNumber = String(query.table ?? "").trim().slice(0, 40);
  const restaurant = await getRestaurantBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  const [menu, offers, optionCatalog, feedback, customer] = await Promise.all([
    getMenu(restaurant.id),
    getMenuOffers(restaurant.id),
    getMenuOptionCatalog(restaurant.id),
    getPublicFeedback(restaurant),
    // Signed-in returning customer → loyalty card + reorder strip. Cold open
    // returns immediately without a DB hit.
    loadCustomerContext(restaurant.id)
  ]);

  // Only serialize fields the interactive menu reads. Server pricing keeps
  // using the complete cached records, including tenant and offer state.
  const categories: CustomerMenuCategory[] = menu.categories.map(
    ({ id, name, name_ar }) => ({ id, name, name_ar })
  );
  const items: CustomerMenuItem[] = menu.items.map(
    ({
      id,
      category_id,
      name,
      name_ar,
      description,
      description_ar,
      price,
      image_url,
      is_available,
      is_featured
    }) => ({
      id,
      category_id,
      name,
      name_ar,
      description,
      description_ar,
      price,
      image_url,
      is_available,
      is_featured
    })
  );
  const customerOffers: CustomerMenuOffer[] = offers.map(
    ({
      id,
      menu_item_id,
      title,
      title_ar,
      description,
      description_ar,
      promotional_price,
      max_quantity_per_order
    }) => ({
      id,
      menu_item_id,
      title,
      title_ar,
      description,
      description_ar,
      promotional_price,
      max_quantity_per_order
    })
  );
  const customerOptionCatalog: CustomerMenuOptionCatalog = {
    groups: optionCatalog.groups.map(
      ({ id, name, name_ar, min_select, max_select, display_order }) => ({
        id,
        name,
        name_ar,
        min_select,
        max_select,
        display_order
      })
    ),
    options: optionCatalog.options.map(
      ({
        id,
        group_id,
        name,
        name_ar,
        price_delta,
        is_available,
        display_order
      }) => ({
        id,
        group_id,
        name,
        name_ar,
        price_delta,
        is_available,
        display_order
      })
    ),
    links: optionCatalog.links.map(
      ({ menu_item_id, group_id, display_order }) => ({
        menu_item_id,
        group_id,
        display_order
      })
    )
  };

  return (
    <CartProvider restaurantSlug={restaurant.slug}>
      <RestaurantMenu
        restaurant={restaurant}
        categories={categories}
        feedback={feedback}
        items={items}
        loyalty={customer.loyalty}
        offers={customerOffers}
        optionCatalog={customerOptionCatalog}
        recentOrders={customer.recentOrders}
        tableNumber={tableNumber}
      />
    </CartProvider>
  );
}

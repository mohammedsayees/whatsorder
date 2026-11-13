import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { SavedOrderConfirmation } from "@/components/customer/SavedOrderConfirmation";
import { OrderStatusActions } from "@/components/admin/OrderStatusActions";
import { useStaffOrderQueue } from "@/components/admin/StaffOrderQueue";
import { demoRestaurant } from "@/lib/demo-data";
import type { StaffOrderPayload } from "@/lib/staff-order-payload";
import { StaffOrderEntry } from "@/components/admin/StaffOrderEntry";
import { MenuPrintDesigner } from "@/components/admin/MenuPrintDesigner";
import type { MenuCategory, MenuItem, MenuOptionCatalog, MenuWithCategories } from "@/lib/types";
const billingMenu: MenuWithCategories = {
 categories: [{ id: "43000000-0000-4000-8000-000000000002", restaurant_id: "restaurant-a", name: "Drinks", is_active: true, display_order: 0, created_at: "" }],
 items: [{ id: "43000000-0000-4000-8000-000000000003", restaurant_id: "restaurant-a", category_id: "43000000-0000-4000-8000-000000000002", name: "Test tea", price: 5, description: null, image_url: null, is_available: true, is_featured: false, created_at: "" }]
};
const printableCategory: MenuCategory = {
 id: "print-drinks", restaurant_id: "restaurant-a", name: "Fresh Juices", name_ar: "عصائر طازجة",
 is_active: true, display_order: 0, created_at: ""
};
const printablePhoto = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#f5c96a"/><circle cx="600" cy="400" r="240" fill="#e47735"/></svg>')}`;
const printableItems: MenuItem[] = Array.from({ length: 7 }, (_, index) => ({
 id: `print-item-${index}`, restaurant_id: "restaurant-a", category_id: printableCategory.id,
 name: index === 0 ? "Mango Juice" : `Juice ${index + 1}`, name_ar: index === 0 ? "عصير مانجو" : null,
 description: "Freshly prepared", price: 8 + index, image_url: printablePhoto,
 is_available: true, is_featured: index === 0, created_at: ""
}));
const printableOptions: MenuOptionCatalog = {
 groups: [{ id: "print-size", restaurant_id: "restaurant-a", name: "Size", min_select: 1, max_select: 1, display_order: 0, created_at: "" }],
 options: [
  { id: "print-small", restaurant_id: "restaurant-a", group_id: "print-size", name: "Small", price_delta: 0, is_available: true, display_order: 0, created_at: "" },
  { id: "print-large", restaurant_id: "restaurant-a", group_id: "print-size", name: "Large", price_delta: 3, is_available: true, display_order: 1, created_at: "" }
 ],
 links: [{ id: "print-link", restaurant_id: "restaurant-a", menu_item_id: "print-item-0", group_id: "print-size", display_order: 0 }]
};

function Queue({ restaurantId }: { restaurantId: string }) {
 const { queue, enqueue } = useStaffOrderQueue(restaurantId);
 return <><button onClick={() => enqueue({ restaurantId, clientOrderId: crypto.randomUUID(), items: [], action: "kitchen" } as unknown as StaffOrderPayload, 5)}>Queue ticket</button>
 <p data-testid="queue-count">{queue.length}</p><p data-testid="attempts">{queue[0]?.attempts ?? 0}</p>{queue.map(entry => <p key={entry.clientOrderId}>{entry.restaurantId}</p>)}</>;
}
function Fixture() {
 const mode = new URLSearchParams(location.search).get("mode");
 const [restaurantId, setRestaurantId] = useState("restaurant-a");
 const [completed, setCompleted] = useState(false);
 useEffect(() => { const handler=()=>setCompleted(true); window.addEventListener("fixture-completed",handler); return ()=>window.removeEventListener("fixture-completed",handler); }, []);
 if (mode === "queue") return <><button onClick={()=>setRestaurantId(restaurantId === "restaurant-a" ? "restaurant-b" : "restaurant-a")}>Switch restaurant</button><Queue key={restaurantId} restaurantId={restaurantId} /></>;
 if (mode === "payment") return <OrderStatusActions fulfilmentType="takeaway" orderId="saved-order" paymentMethod={null} status={completed ? "Completed" : "Preparing"} />;
 if (mode === "billing") return <><button onClick={()=>setRestaurantId(restaurantId === "restaurant-a" ? "restaurant-b" : "restaurant-a")}>Switch restaurant</button><StaffOrderEntry key={restaurantId} staffUserId="staff-a" restaurant={{ ...demoRestaurant, id: restaurantId }} menu={billingMenu} orderTypes={["takeaway", "delivery", "dine_in"]} deliveryFee={3} /></>;
 if (mode === "print-menu") return <MenuPrintDesigner categories={[printableCategory]} items={printableItems} menuUrl="https://example.com/r/demo" optionCatalog={printableOptions} qrDataUrl={printablePhoto} restaurant={{ ...demoRestaurant, id: "restaurant-a", name: "Fixture Cafe", slug: "fixture-cafe" }} />;
 return <SavedOrderConfirmation restaurant={demoRestaurant} webPushPublicKey={null} order={{ id: "saved-order-12345678", status:"New", items:[{item_id:"tea",name:"Tea",price:5,quantity:2}], total:10, whatsapp_message:"Original saved order: 2 Tea, total 10" }} />;
}
createRoot(document.getElementById("root")!).render(<Fixture />);

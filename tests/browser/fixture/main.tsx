import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { SavedOrderConfirmation } from "@/components/customer/SavedOrderConfirmation";
import { RiderLocationSharer } from "@/components/rider/RiderLocationSharer";
import { OrderStatusActions } from "@/components/admin/OrderStatusActions";
import { useStaffOrderQueue } from "@/components/admin/StaffOrderQueue";
import { demoRestaurant } from "@/lib/demo-data";
import type { StaffOrderPayload } from "@/lib/staff-order-payload";
import { StaffOrderEntry } from "@/components/admin/StaffOrderEntry";
import { PromoCodeField } from "@/components/customer/PromoCodeField";
import { computePromoDiscount, type PromoTerms } from "@/lib/promo-codes";
import { MenuPrintDesigner } from "@/components/admin/MenuPrintDesigner";
import { BillingBanner } from "@/components/admin/BillingBanner";
import { ItemOptionsSheet } from "@/components/customer/ItemOptionsSheet";
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
function ItemSheetFixture() {
 const [open, setOpen] = useState(true);
 const [added, setAdded] = useState("");
 const option = (id: string, group_id: string, name: string, price_delta: number) => ({ id, group_id, name, name_ar: null, price_delta, is_available: true, display_order: 0 });
 const groups = [
  { group: { id: "size", name: "Size", name_ar: null, min_select: 1, max_select: 1, display_order: 0 }, options: [option("small", "size", "Small", 0), option("large", "size", "Large", 2)] },
  { group: { id: "extras", name: "Extras", name_ar: null, min_select: 0, max_select: 2, display_order: 1 }, options: [option("saffron", "extras", "Saffron", 1)] }
 ];
 const item = { id: "karak", category_id: "tea", name: "Karak Tea", name_ar: null, price: 1, description: "Slow-boiled with cardamom", description_ar: null, image_url: null, is_available: true, is_featured: false };
 return <><button onClick={() => setOpen(true)}>Open item</button><p data-testid="added">{added}</p>
  {open ? <ItemOptionsSheet basePrice={1} groups={groups} item={item as never} language="en" restaurant={demoRestaurant} showDetails
   onAdd={(options, quantity) => { setAdded(`${quantity}x ${options.map(o => o.name).join("+")}`); setOpen(false); }} onClose={() => setOpen(false)} /> : null}</>;
}
function PromoFixture() {
 const [terms, setTerms] = useState<PromoTerms | null>(null);
 const [subtotal, setSubtotal] = useState(30);
 const discount = terms ? computePromoDiscount(terms, subtotal) : 0;
 return <><PromoCodeField applied={terms} language="en" lines={[{ item_id: "tea", name: "Tea", price: 10, quantity: subtotal / 10 }]} onChange={setTerms} restaurant={demoRestaurant} subtotal={subtotal} />
  <button onClick={() => setSubtotal(10)}>Shrink cart</button>
  <p data-testid="discount">{discount}</p><p data-testid="total">{subtotal - discount}</p></>;
}
function Fixture() {
 const mode = new URLSearchParams(location.search).get("mode");
 const [restaurantId, setRestaurantId] = useState("restaurant-a");
 const [completed, setCompleted] = useState(false);
 useEffect(() => { const handler=()=>setCompleted(true); window.addEventListener("fixture-completed",handler); return ()=>window.removeEventListener("fixture-completed",handler); }, []);
 if (mode === "queue") return <><button onClick={()=>setRestaurantId(restaurantId === "restaurant-a" ? "restaurant-b" : "restaurant-a")}>Switch restaurant</button><Queue key={restaurantId} restaurantId={restaurantId} /></>;
 if (mode === "payment") return <OrderStatusActions fulfilmentType="takeaway" orderId="saved-order" paymentMethod={null} status={completed ? "Completed" : "Preparing"} />;
 if (mode === "billing") return <><button onClick={()=>setRestaurantId(restaurantId === "restaurant-a" ? "restaurant-b" : "restaurant-a")}>Switch restaurant</button><StaffOrderEntry key={restaurantId} staffUserId="staff-a" restaurant={{ ...demoRestaurant, id: restaurantId }} menu={billingMenu} orderTypes={["takeaway", "delivery", "dine_in"]} deliveryFee={3} discountLimitPercent={10} /></>;
 if (mode === "print-menu") return <MenuPrintDesigner categories={[printableCategory]} items={printableItems} menuUrl="https://example.com/r/demo" optionCatalog={printableOptions} qrDataUrl={printablePhoto} restaurant={{ ...demoRestaurant, id: "restaurant-a", name: "Fixture Cafe", slug: "fixture-cafe" }} />;
 if (mode === "rider-page") return <RiderLocationSharer initialState="active" token="riderTrackingTokenAAAAAAAAAAAAAAAA" />;
 if (mode === "status-rider" || mode === "status-rider-stale") {
  const stale = mode === "status-rider-stale";
  return <SavedOrderConfirmation restaurant={demoRestaurant} webPushPublicKey={null} order={{ id: "43000000-0000-4000-8000-0000000000cc", status: "Out for Delivery", items:[{item_id:"tea",name:"Tea",price:5,quantity:2}], total:10, whatsapp_message:"Rider order", created_at: new Date(Date.now() - 25 * 60_000).toISOString(), fulfilment_type:"delivery", status_events: [], customer_arrived_at: null, customer_arrival_note: null, rider: { name: "Ravi", phone: "971501234567", location: stale ? null : { distanceKm: 1.24, updatedAt: new Date(Date.now() - 30_000).toISOString(), mapsUrl: "https://www.google.com/maps?q=25.4,55.5" } } }} />;
 }
 if (mode === "promo") return <PromoFixture />;
 if (mode === "item-sheet") return <ItemSheetFixture />;
 if (mode === "billing-autopay-failed") return <BillingBanner autopayFailure="insufficient_funds" billingHref="/admin/billing" status="active" />;
 if (mode === "status-paying" || mode === "status-paid") {
  const paid = mode === "status-paid";
  return <SavedOrderConfirmation restaurant={demoRestaurant} webPushPublicKey={null} paymentReturn="done" order={{ id: "43000000-0000-4000-8000-0000000000dd", status: "New", items:[{item_id:"tea",name:"Tea",price:5,quantity:2}], total:10, whatsapp_message:"Online order", created_at: new Date().toISOString(), fulfilment_type:"takeaway", status_events: [], customer_arrived_at: null, customer_arrival_note: null, rider: null, online_payment_status: paid ? "paid" : "pending" }} />;
 }
 if (mode === "status-car") {
  return <SavedOrderConfirmation restaurant={demoRestaurant} webPushPublicKey={null} order={{ id: "43000000-0000-4000-8000-0000000000bb", status: "Preparing", items:[{item_id:"tea",name:"Tea",price:5,quantity:2}], total:10, whatsapp_message:"Car order", created_at: new Date(Date.now() - 5 * 60_000).toISOString(), fulfilment_type:"car_pickup", status_events: [], customer_arrived_at: null, customer_arrival_note: null, rider: null }} />;
 }
 if (mode === "status-waiting" || mode === "status-live") {
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const waiting = mode === "status-waiting";
  return <SavedOrderConfirmation restaurant={demoRestaurant} webPushPublicKey={null} prepMinutes={waiting ? null : 12} order={{ id: "43000000-0000-4000-8000-0000000000aa", status: waiting ? "New" : "Preparing", items:[{item_id:"tea",name:"Tea",price:5,quantity:2}], total:10, whatsapp_message:"Tracked order", created_at: minutesAgo(waiting ? 20 : 8), fulfilment_type:"delivery", status_events: waiting ? [] : [{ to_status:"Accepted", created_at: minutesAgo(6) }, { to_status:"Preparing", created_at: minutesAgo(4) }], customer_arrived_at: null, customer_arrival_note: null, rider: null }} />;
 }
 return <SavedOrderConfirmation restaurant={demoRestaurant} webPushPublicKey={null} order={{ id: "saved-order-12345678", status:"New", items:[{item_id:"tea",name:"Tea",price:5,quantity:2}], total:10, whatsapp_message:"Original saved order: 2 Tea, total 10", created_at:null, fulfilment_type:"takeaway", status_events:[], customer_arrived_at:null, customer_arrival_note:null, rider:null }} />;
}
createRoot(document.getElementById("root")!).render(<Fixture />);

import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { SavedOrderConfirmation } from "@/components/customer/SavedOrderConfirmation";
import { OrderStatusActions } from "@/components/admin/OrderStatusActions";
import { useStaffOrderQueue } from "@/components/admin/StaffOrderQueue";
import { demoRestaurant } from "@/lib/demo-data";
import type { StaffOrderPayload } from "@/lib/staff-order-payload";

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
 return <SavedOrderConfirmation restaurant={demoRestaurant} webPushPublicKey={null} order={{ id: "saved-order-12345678", status:"New", items:[{item_id:"tea",name:"Tea",price:5,quantity:2}], total:10, whatsapp_message:"Original saved order: 2 Tea, total 10" }} />;
}
createRoot(document.getElementById("root")!).render(<Fixture />);

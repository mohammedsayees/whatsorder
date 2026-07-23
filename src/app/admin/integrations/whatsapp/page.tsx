import QRCode from "qrcode";
import { WhatsAppIntegrationPanel } from "@/components/admin/WhatsAppIntegrationPanel";
import { getWhatsAppChatbotSettings } from "@/lib/whatsapp-ai";
import { getWhatsAppIntegration } from "@/lib/whatsapp-integration";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

export const dynamic = "force-dynamic";

export default async function WhatsAppIntegrationPage() {
  const session = await requireRestaurantRole(["restaurant_admin", "owner"]);
  const [integration, settings] = await Promise.all([
    getWhatsAppIntegration(session.restaurantId),
    getWhatsAppChatbotSettings(session.restaurantId)
  ]);

  const qrIsCurrent =
    integration?.qr_payload &&
    integration.qr_expires_at &&
    Date.parse(integration.qr_expires_at) > Date.now();
  const qrDataUrl = qrIsCurrent
    ? await QRCode.toDataURL(integration.qr_payload as string, {
        margin: 1,
        width: 440
      })
    : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-black text-ink">WhatsApp chatbot</h1>
      <p className="mt-2 max-w-3xl text-stone-600">
        Connect the restaurant&apos;s current number and control AI replies from one place.
      </p>
      <div className="mt-6">
        <WhatsAppIntegrationPanel
          connectorConfigured={Boolean(
            process.env.WHATSAPP_WEB_CONNECTOR_URL &&
              process.env.WHATSAPP_WEB_CONNECTOR_SECRET
          )}
          integration={integration}
          qrDataUrl={qrDataUrl}
          settings={settings}
        />
      </div>
    </main>
  );
}


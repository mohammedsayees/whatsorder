export function connectorHttpError(status: number): string {
  if (status === 404) return "WhatsApp connector application was not found. Check that the Railway service is running, its plan is active, and WHATSAPP_WEB_CONNECTOR_URL matches its public domain.";
  if (status === 401 || status === 403) return "WhatsApp connector authentication failed. Check that the app and connector use the same signing secret.";
  if (status === 409) return "WhatsApp is not connected. Open Automation & setup and reconnect the restaurant phone.";
  if (status >= 500) return "WhatsApp connector is temporarily unavailable. Check the host service and retry.";
  return `WhatsApp connector request failed (${status}). Check the connector service logs.`;
}

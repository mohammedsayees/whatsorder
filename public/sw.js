self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "WhatsOrder", {
      badge: payload.badge || "/icons/icon-192.png",
      body: payload.body || "Your order has an update.",
      data: { url: payload.url || "/" },
      icon: payload.icon || "/icons/icon-192.png",
      tag: payload.tag || "whatsorder-update"
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url === destination);
      return existing ? existing.focus() : self.clients.openWindow(destination);
    })
  );
});

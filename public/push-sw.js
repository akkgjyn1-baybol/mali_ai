/* Push handlers for Mali. Imported into the next-pwa service worker, or registered directly in dev. */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Mali";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.id || undefined,
    data: { url: data.url || "/notifications" },
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      if (typeof data.badge === "number" && self.navigator.setAppBadge) {
        await self.navigator.setAppBadge(data.badge).catch(() => {});
      }
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) client.postMessage({ type: "mali:push", url: options.data.url });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

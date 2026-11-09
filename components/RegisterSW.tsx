"use client";

import { useEffect } from "react";
import { serviceWorkerUrl } from "@/lib/push-client";

export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register(serviceWorkerUrl())
      .then(async (reg) => {
        if (!("Notification" in window) || Notification.permission !== "granted") return;
        const subscription = await reg.pushManager?.getSubscription();
        if (!subscription) return;
        await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });
      })
      .catch(() => {});

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "mali:push") window.dispatchEvent(new Event("mali:push"));
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);
  return null;
}

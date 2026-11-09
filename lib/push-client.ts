export function serviceWorkerUrl() {
  return process.env.NODE_ENV === "development" ? "/push-sw.js" : "/sw.js";
}

export type PushSupport = "ok" | "ios-needs-install" | "unsupported";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return "ios-needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  return "ok";
}

function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  await navigator.serviceWorker.register(serviceWorkerUrl());
  return navigator.serviceWorker.ready;
}

export async function currentSubscription() {
  if (pushSupport() !== "ok") return null;
  const reg = await registration();
  return reg.pushManager.getSubscription();
}

export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Уведомления запрещены. Разреши их в настройках телефона или браузера.");
  }
  const { publicKey } = await fetch("/api/push").then((r) => r.json());
  if (!publicKey) throw new Error("На сервере не настроены VAPID-ключи.");

  const reg = await registration();
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey),
    }));

  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!res.ok) throw new Error("Не удалось сохранить подписку");
  return subscription;
}

export async function disablePush() {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await fetch("/api/push", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
}

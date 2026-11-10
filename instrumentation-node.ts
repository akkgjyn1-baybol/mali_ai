import { runTick } from "./lib/scheduler";

export function startLocalScheduler() {
  if (process.env.VERCEL) return;
  if (process.env.DISABLE_LOCAL_SCHEDULER === "1") return;

  const globalState = globalThis as typeof globalThis & { __maliScheduler?: NodeJS.Timeout };
  if (globalState.__maliScheduler) return;

  const tick = () =>
    runTick().catch((error) => console.error("[mali] local scheduler failed", error));

  globalState.__maliScheduler = setInterval(tick, 10 * 60 * 1000);
  setTimeout(tick, 15_000);
}

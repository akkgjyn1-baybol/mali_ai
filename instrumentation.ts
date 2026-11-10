export async function register() {
  // The import must stay inside this block so it is stripped from the Edge bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startLocalScheduler } = await import("./instrumentation-node");
    startLocalScheduler();
  }
}

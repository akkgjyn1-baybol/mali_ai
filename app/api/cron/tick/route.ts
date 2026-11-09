import { assertCronAuth } from "@/lib/cron-auth";
import { runTick } from "@/lib/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const unauthorized = assertCronAuth(req);
  if (unauthorized) return unauthorized;
  const result = await runTick();
  return Response.json({ success: true, ...result });
}

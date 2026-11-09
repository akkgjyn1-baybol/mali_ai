import { readQuota } from "@/lib/quota";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireUser();
  if (error) return error;
  return Response.json(await readQuota());
}

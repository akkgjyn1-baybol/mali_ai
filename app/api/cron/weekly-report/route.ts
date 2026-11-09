import { assertCronAuth } from "@/lib/cron-auth";
import { listUsers } from "@/lib/db";
import { generateWeeklyReportForUser } from "@/lib/reports";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const unauthorized = assertCronAuth(req);
  if (unauthorized) return unauthorized;

  const users = await listUsers();
  const ids: string[] = [];

  for (const user of users) {
    try {
      const report = await generateWeeklyReportForUser(user.id);
      ids.push(report.id);
    } catch (error) {
      console.error("Weekly report cron failed for", user.id, error);
    }
  }

  return Response.json({ success: true, reports: ids });
}

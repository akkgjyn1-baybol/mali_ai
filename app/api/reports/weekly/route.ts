import { generateWeeklyReportForUser } from "@/lib/reports";
import { listWeeklyReports } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const reports = await listWeeklyReports(user.id);
  return Response.json({ reports });
}

export async function POST() {
  const { user, error } = await requireUser();
  if (error) return error;
  try {
    const report = await generateWeeklyReportForUser(user.id);
    return Response.json({ report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Не удалось собрать отчет";
    return Response.json({ error: message }, { status: 500 });
  }
}

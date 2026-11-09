import { parseDataUrl, saveImage } from "@/lib/images";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const parsed = typeof body?.dataUrl === "string" ? parseDataUrl(body.dataUrl) : null;
  if (!parsed) {
    return Response.json({ error: "Нужна картинка JPEG, PNG или WebP до ~1 МБ" }, { status: 400 });
  }
  const id = await saveImage(user.id, parsed.mime, parsed.data);
  return Response.json({ id });
}

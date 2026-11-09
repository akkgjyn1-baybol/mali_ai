import { loadImage } from "@/lib/images";
import { getSessionUserId } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  const image = await loadImage(params.id);
  if (!userId || !image || image.userId !== userId) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(Buffer.from(image.data, "base64"), {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

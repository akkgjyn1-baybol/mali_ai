import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { hasKv, kvGet, kvSet } from "./redis";

export type StoredImage = { userId: string; mime: string; data: string };

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BASE64 = 1_400_000;

const imagesDir = path.join(process.cwd(), ".data", "images");

function imageKey(id: string) {
  return `image:${id}`;
}

export function parseDataUrl(dataUrl: string) {
  const match = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match || !ALLOWED.includes(match[1])) return null;
  if (match[2].length > MAX_IMAGE_BASE64) return null;
  return { mime: match[1], data: match[2] };
}

export async function compressImage(base64: string, maxSide = 768) {
  const sharp = (await import("sharp")).default;
  const output = await sharp(Buffer.from(base64, "base64"))
    .resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  return { mime: "image/webp", data: output.toString("base64") };
}

export async function saveImage(userId: string, mime: string, data: string) {
  const id = randomUUID();
  const record: StoredImage = { userId, mime, data };
  if (hasKv) {
    await kvSet(imageKey(id), record);
  } else {
    await fs.mkdir(imagesDir, { recursive: true });
    await fs.writeFile(path.join(imagesDir, `${id}.json`), JSON.stringify(record), "utf8");
  }
  return id;
}

export async function loadImage(id: string): Promise<StoredImage | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  if (hasKv) return kvGet<StoredImage>(imageKey(id));
  try {
    return JSON.parse(await fs.readFile(path.join(imagesDir, `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

export async function loadImages(userId: string, ids: string[]) {
  const map: Record<string, { mime: string; data: string }> = {};
  await Promise.all(
    ids.map(async (id) => {
      const image = await loadImage(id);
      if (image && image.userId === userId) map[id] = { mime: image.mime, data: image.data };
    }),
  );
  return map;
}

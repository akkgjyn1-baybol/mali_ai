import { compressImage, saveImage } from "./images";
import { noteModelRequest } from "./quota";

function mimeFromBase64(data: string) {
  if (data.startsWith("/9j/")) return "image/jpeg";
  if (data.startsWith("iVBOR")) return "image/png";
  if (data.startsWith("UklGR")) return "image/webp";
  return null;
}

export function canDraw() {
  return Boolean(
    (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) ||
      process.env.GEMINI_IMAGE_MODEL,
  );
}

async function drawWithCloudflare(prompt: string) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) return null;
  const model = process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell";
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt: prompt.slice(0, 2000), steps: 4 }),
    },
  );
  if (!res.ok) {
    console.error("[mali] cloudflare image failed", res.status, (await res.text()).slice(0, 300));
    return null;
  }
  const json = await res.json();
  const data: unknown = json?.result?.image;
  if (typeof data !== "string" || !mimeFromBase64(data)) {
    console.error("[mali] cloudflare returned no image", Object.keys(json?.result ?? {}));
    return null;
  }
  return data;
}

async function drawWithGemini(prompt: string) {
  const model = process.env.GEMINI_IMAGE_MODEL;
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!model || !key) return null;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    },
  );
  await noteModelRequest(model);
  if (!res.ok) return null;
  const json = await res.json();
  const parts: Array<{ inlineData?: { mimeType: string; data: string } }> =
    json?.candidates?.[0]?.content?.parts ?? [];
  return parts.find((p) => p.inlineData)?.inlineData?.data ?? null;
}

/** Draws from an English prompt and stores the result. Returns the image id, or null if drawing is unavailable. */
export async function drawImage(userId: string, prompt: string) {
  let data: string | null = null;
  try {
    data = await drawWithCloudflare(prompt);
  } catch (error) {
    console.error("[mali] cloudflare image failed", error);
  }
  if (!data) {
    try {
      data = await drawWithGemini(prompt);
    } catch (error) {
      console.error("[mali] gemini image failed", error);
    }
  }
  if (!data) return null;
  const small = await compressImage(data);
  return saveImage(userId, small.mime, small.data);
}

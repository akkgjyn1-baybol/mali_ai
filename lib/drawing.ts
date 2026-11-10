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

// Cloudflare queues requests unpredictably (from seconds to minutes), and the whole chat
// request must fit Vercel's 60s limit, so several models race and the first image wins.
const DRAW_BUDGET_MS = 35_000;
const CLOUDFLARE_MODELS = [
  process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell",
  "@cf/bytedance/stable-diffusion-xl-lightning",
];

async function drawWithCloudflare(model: string, prompt: string, signal: AbortSignal) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) return null;
  const flux = model.includes("flux");
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(
        flux ? { prompt: prompt.slice(0, 2000), steps: 4 } : { prompt: prompt.slice(0, 2000), num_steps: 4 },
      ),
    },
  );
  if (!res.ok) {
    console.error("[mali] cloudflare image failed", model, res.status, (await res.text()).slice(0, 300));
    return null;
  }
  if (!res.headers.get("content-type")?.includes("json")) {
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  }
  const json = await res.json();
  const data: unknown = json?.result?.image;
  if (typeof data !== "string" || !mimeFromBase64(data)) {
    console.error("[mali] cloudflare returned no image", model, Object.keys(json?.result ?? {}));
    return null;
  }
  return data;
}

async function drawWithGemini(prompt: string, signal: AbortSignal) {
  const model = process.env.GEMINI_IMAGE_MODEL;
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!model || !key) return null;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      signal,
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
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DRAW_BUDGET_MS);
  const attempt = async (name: string, draw: () => Promise<string | null>) => {
    try {
      const data = await draw();
      if (data) return { name, data };
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error("[mali] image failed", name, error instanceof Error ? error.name : error);
      }
    }
    throw new Error(`${name} produced no image`);
  };

  let winner: { name: string; data: string } | null = null;
  try {
    winner = await Promise.any([
      ...CLOUDFLARE_MODELS.map((model) =>
        attempt(model, () => drawWithCloudflare(model, prompt, controller.signal)),
      ),
      attempt("gemini", () => drawWithGemini(prompt, controller.signal)),
    ]);
  } catch {
    winner = null;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }

  console.log(
    `[mali] drawing ${winner ? `done by ${winner.name}` : "failed"} after ${Date.now() - started}ms`,
  );
  if (!winner) return null;
  const small = await compressImage(winner.data);
  return saveImage(userId, small.mime, small.data);
}

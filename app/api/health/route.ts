export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    gemini: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
    kv: Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
    postgres: Boolean(process.env.POSTGRES_URL),
  });
}

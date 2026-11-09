import { mkdirSync, readFileSync, writeFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const accountId = env.CLOUDFLARE_ACCOUNT_ID;
const token = env.CLOUDFLARE_API_TOKEN;
if (!accountId || !token) {
  console.log("Заполни CLOUDFLARE_ACCOUNT_ID и CLOUDFLARE_API_TOKEN в .env.local");
  process.exit(1);
}

const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      prompt:
        "a lighthouse standing in a desert at night, fish floating in the air, dreamy surreal watercolor illustration, soft muted colors, no text",
      steps: 4,
    }),
  },
);
const json = await res.json();
if (!res.ok || !json?.result?.image) {
  console.log("Ошибка", res.status, JSON.stringify(json?.errors ?? json).slice(0, 400));
  process.exit(1);
}
mkdirSync(".data", { recursive: true });
writeFileSync(".data/cloudflare-test.jpg", Buffer.from(json.result.image, "base64"));
console.log("Готово: .data/cloudflare-test.jpg");

const WEATHER = /погод|weather|температур|градус/i;
const RATES = /курс|доллар|евро|сом\b/i;
const NEWS = /новост|что случил|что в мире|что в стране/i;
const LOOKUP = /в интернете|загугли|погугли|найди|посмотри|поищи/i;

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url: string, init?: RequestInit, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function placeVariants(name: string) {
  const variants = [name];
  const last = name.split(/[-\s]/).at(-1) ?? name;
  const swaps: Array<[RegExp, string]> = [
    [/ы$/i, "а"],
    [/е$/i, "а"],
    [/у$/i, "а"],
    [/и$/i, "а"],
    [/ой$/i, "а"],
  ];
  if (last.length >= 3) {
    for (const [pattern, next] of swaps) {
      if (pattern.test(last)) variants.push(name.replace(new RegExp(`${last}$`, "i"), last.replace(pattern, next)));
    }
  }
  if (last.length > 4 && /[ая]$/i.test(last)) {
    variants.push(name.replace(new RegExp(`${last}$`, "i"), last.replace(/[ая]$/i, "")));
  }
  return Array.from(new Set(variants.map((item) => item.trim()).filter((item) => item.length >= 3)));
}

function placeQuery(message: string) {
  return message
    .replace(
      /посмотри|покажи|скажи|узнай|какая|какой|какое|какие|сейчас|сегодня|завтра|пожалуйста|погода|погоду|погоды|в интернете|интернете|интернет|температура|температуру|градус|градусов|на улице|за окном/gi,
      " ",
    )
    .replace(/[^0-9A-Za-z\u0400-\u04FF\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sky(code: number) {
  if (code === 0) return "ясно";
  if (code <= 2) return "небольшая облачность";
  if (code === 3) return "пасмурно";
  if (code === 45 || code === 48) return "туман";
  if (code >= 51 && code <= 57) return "морось";
  if (code >= 61 && code <= 67) return "дождь";
  if (code >= 71 && code <= 77) return "снег";
  if (code >= 80 && code <= 82) return "ливень";
  if (code === 85 || code === 86) return "снег";
  if (code >= 95) return "гроза";
  return "переменная облачность";
}

type GeoPlace = {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
};

async function geocode(name: string): Promise<GeoPlace | null> {
  for (const variant of placeVariants(name)) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(variant)}&count=5&language=ru&format=json`;
    const raw = await fetchText(url);
    if (!raw) continue;
    const json = JSON.parse(raw) as { results?: GeoPlace[] };
    const found = json.results?.[0];
    if (found) return found;
  }
  return null;
}

async function weatherReport(message: string) {
  const placeName = placeQuery(message);
  if (!placeName) return "Город в вопросе не назван.";
  const place = await geocode(placeName);
  if (!place) return `Место «${placeName}» не нашлось.`;
  const timezone = place.timezone || "Asia/Bishkek";
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${place.latitude}&longitude=${place.longitude}` +
    "&current=temperature_2m,weather_code,wind_speed_10m" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&forecast_days=1&wind_speed_unit=ms" +
    `&timezone=${encodeURIComponent(timezone)}`;
  const raw = await fetchText(url);
  if (!raw) return "";
  const data = JSON.parse(raw) as {
    current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number };
    daily?: {
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_probability_max?: number[];
      weather_code?: number[];
    };
  };
  const current = data.current;
  if (!current || typeof current.temperature_2m !== "number") return "";
  const region = place.admin1 && !/[A-Za-z]/.test(place.admin1) ? place.admin1 : "";
  const where = [place.name, region, place.country].filter(Boolean).join(", ");
  const max = data.daily?.temperature_2m_max?.[0];
  const min = data.daily?.temperature_2m_min?.[0];
  const rain = data.daily?.precipitation_probability_max?.[0];
  const lines = [
    `${where}. Сейчас ${Math.round(current.temperature_2m)}°, ${sky(current.weather_code ?? 0)}, ветер ${Math.round(current.wind_speed_10m ?? 0)} м/с.`,
  ];
  if (typeof min === "number" && typeof max === "number") {
    lines.push(
      `Сегодня от ${Math.round(min)}° до ${Math.round(max)}°${typeof rain === "number" ? `, вероятность осадков ${rain}%` : ""}.`,
    );
  }
  return lines.join(" ");
}

async function ratesReport() {
  const raw = await fetchText("https://open.er-api.com/v6/latest/USD");
  if (!raw) return "";
  const data = JSON.parse(raw) as { rates?: { KGS?: number; EUR?: number } };
  const kgs = data.rates?.KGS;
  const eur = data.rates?.EUR;
  if (!kgs) return "";
  const lines = [`1 доллар ≈ ${kgs.toFixed(2)} сома.`];
  if (eur) lines.push(`1 евро ≈ ${(kgs / eur).toFixed(2)} сома.`);
  return lines.join(" ");
}

async function searchReport(query: string) {
  if (!query) return "";
  const body = new URLSearchParams({ q: query });
  const html = await fetchText("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const titles = Array.from(html.matchAll(/class="result__a"[^>]*>([\s\S]*?)<\/a>/g)).map((match) =>
    decodeHtml(match[1]),
  );
  const snippets = Array.from(
    html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/g),
  ).map((match) => decodeHtml(match[1]));
  const rows = titles
    .map((title, index) => {
      const snippet = snippets[index];
      return snippet ? `${title}: ${snippet}` : title;
    })
    .filter(Boolean)
    .slice(0, 4);

  const newsXml = await fetchText(
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ru&gl=KG&ceid=KG:ru`,
  );
  const headlines = Array.from(newsXml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>/g))
    .map((match) => decodeHtml(match[1]))
    .filter((title) => title && !/google новост/i.test(title))
    .slice(0, 4);

  const chunks = [];
  if (rows.length) chunks.push(rows.join("\n"));
  if (headlines.length) chunks.push(`Заголовки:\n${headlines.map((item) => `- ${item}`).join("\n")}`);
  return chunks.join("\n").slice(0, 1200);
}

export function wantsWeb(message: string) {
  return WEATHER.test(message) || RATES.test(message) || NEWS.test(message) || LOOKUP.test(message);
}

export async function lookupWeb(message: string) {
  if (!wantsWeb(message)) return null;
  const parts: string[] = [];
  if (WEATHER.test(message)) parts.push(await weatherReport(message).catch(() => ""));
  if (RATES.test(message)) parts.push(await ratesReport().catch(() => ""));
  if (NEWS.test(message) || (LOOKUP.test(message) && !WEATHER.test(message) && !RATES.test(message))) {
    const query = message
      .replace(/посмотри|покажи|найди|загугли|погугли|поищи|в интернете|пожалуйста/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    parts.push(await searchReport(query).catch(() => ""));
  }
  const text = parts.map((part) => part.trim()).filter(Boolean).join("\n\n");
  return text || "Проверка ничего не вернула.";
}

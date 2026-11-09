export function friendlyGeminiError(raw: string) {
  let message = raw;
  try {
    const parsed = JSON.parse(raw);
    message = parsed?.error?.message || parsed?.message || raw;
  } catch {
    const match = raw.match(/"message":\s*"([^"]+)"/);
    if (match?.[1]) message = match[1];
  }
  if (/per day|free tier/i.test(`${raw} ${message}`)) {
    return "Суточный лимит Gemini на сегодня закончился. Он обновится около 14:00 по времени Кыргызстана.";
  }
  if (/quota|rate.limit|resource_exhausted/i.test(`${raw} ${message}`)) {
    return "Gemini ограничил частоту запросов. Подожди минуту и напиши ещё раз.";
  }
  if (/high demand|UNAVAILABLE|503|overloaded/i.test(`${raw} ${message}`)) {
    return "Gemini сейчас перегружен. Подожди пару секунд и напиши ещё раз.";
  }
  if (/no longer available/i.test(message)) {
    return "Эта модель Gemini больше недоступна.";
  }
  return message;
}

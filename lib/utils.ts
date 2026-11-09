export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Bishkek";

export function calendarDate(value: string | Date = new Date(), timeZone = APP_TIMEZONE) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayDate(date = new Date()) {
  return calendarDate(date);
}

export function hourInTimeZone(date = new Date(), timeZone = APP_TIMEZONE) {
  const raw = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(date);
  const hour = Number(raw);
  if (!Number.isFinite(hour)) return 0;
  return hour % 24;
}

function timeZoneOffsetMs(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const hour = get("hour") % 24;
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function endOfCalendarDay(ymd: string, timeZone = APP_TIMEZONE) {
  const [year, month, day] = ymd.split("-").map(Number);
  const wall = Date.UTC(year, month - 1, day, 23, 59, 59);
  let offset = timeZoneOffsetMs(new Date(wall), timeZone);
  let utc = wall - offset;
  const offsetAtUtc = timeZoneOffsetMs(new Date(utc), timeZone);
  if (offsetAtUtc !== offset) utc = wall - offsetAtUtc;
  return new Date(utc + 999);
}

export function wallTimeToDate(ymd: string, hhmm: string, timeZone = APP_TIMEZONE) {
  const [year, month, day] = ymd.split("-").map(Number);
  const [hour, minute] = hhmm.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const offset = timeZoneOffsetMs(new Date(wall), timeZone);
  let utc = wall - offset;
  const offsetAtUtc = timeZoneOffsetMs(new Date(utc), timeZone);
  if (offsetAtUtc !== offset) utc = wall - offsetAtUtc;
  return new Date(utc);
}

export function daysBetween(isoDate: string, now = new Date()) {
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return 999;
  return Math.floor((now.getTime() - then) / (1000 * 60 * 60 * 24));
}

export function formatDateRu(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: APP_TIMEZONE,
  }).format(date);
}

export function formatTimeRu(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIMEZONE,
  }).format(date);
}

export function weekRange(now = new Date(), timeZone = APP_TIMEZONE) {
  const today = calendarDate(now, timeZone);
  const [year, month, day] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7;
  const monday = new Date(Date.UTC(year, month - 1, day - (weekday - 1)));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (date: Date) => date.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday) };
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function titleFromText(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "Новый чат";
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
}

export function conversationTitle(messages: { role: string; content: string }[], fallback = "Новый чат") {
  const first = messages.find((m) => m.role === "user")?.content;
  return first ? titleFromText(first) : fallback;
}

export function personalityDelta(
  current: { warmth: number; directness: number },
  previous?: { warmth: number; directness: number } | null,
) {
  return {
    warmth: round2(current.warmth - (previous?.warmth ?? current.warmth)),
    directness: round2(current.directness - (previous?.directness ?? current.directness)),
  };
}

import { randomUUID } from "crypto";
import { FAST_MODEL, generatePlainText } from "./ai";
import { buildFollowUpExtractionPrompt } from "./prompts";
import { kvGet, kvSet } from "./redis";
import type { FollowUp } from "./types";
import { wallTimeToDate } from "./utils";

const MAX_STORED = 30;

const TIME_HINT_RE =
  /завтра|послезавтра|сегодня|вечером|утром|ночью|на выходных|в выходные|на неделе|через (\d+|пару|неделю|месяц|час)|в (понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)|\d{1,2}[.:]\d{2}|\d{1,2} (января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)|собеседовани|экзамен|контрольн|сессия|зачёт|зачет|врач|операци|свидани|поездк|перелёт|перелет|дедлайн|соревновани|концерт|день рождения/i;

function followUpsKey(userId: string) {
  return `user:${userId}:followups`;
}

export async function listFollowUps(userId: string) {
  return (await kvGet<FollowUp[]>(followUpsKey(userId))) ?? [];
}

async function saveFollowUps(userId: string, list: FollowUp[]) {
  const pending = list.filter((f) => !f.done);
  const done = list.filter((f) => f.done).slice(-10);
  await kvSet(followUpsKey(userId), [...pending, ...done].slice(-MAX_STORED));
}

export function mightMentionEvent(text: string) {
  return text.length >= 8 && TIME_HINT_RE.test(text);
}

export async function extractFollowUps(userId: string, userText: string, recentContext: string) {
  if (!mightMentionEvent(userText)) return [];
  const existing = await listFollowUps(userId);
  const raw = await generatePlainText(
    buildFollowUpExtractionPrompt({
      userText,
      recentContext,
      pending: existing.filter((f) => !f.done).map((f) => f.about),
    }),
    FAST_MODEL,
  );
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) return [];

  let parsed: { events?: Array<{ about?: string; date?: string; time?: string; question?: string }> };
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }

  const now = Date.now();
  const created: FollowUp[] = [];
  for (const event of parsed.events ?? []) {
    if (!event.about || !event.date) continue;
    const when = wallTimeToDate(event.date, event.time || "19:00");
    if (!when || when.getTime() < now + 30 * 60 * 1000) continue;
    if (when.getTime() > now + 45 * 24 * 60 * 60 * 1000) continue;
    created.push({
      id: randomUUID(),
      about: event.about.slice(0, 200),
      question: (event.question ?? "").slice(0, 200),
      check_at: when.toISOString(),
      created_at: new Date().toISOString(),
      done: false,
    });
  }
  if (created.length) {
    const fresh = await listFollowUps(userId);
    await saveFollowUps(userId, [...fresh, ...created]);
  }
  return created;
}

export async function dueFollowUp(userId: string, now = Date.now()) {
  const list = await listFollowUps(userId);
  return (
    list
      .filter((f) => !f.done && new Date(f.check_at).getTime() <= now)
      .sort((a, b) => a.check_at.localeCompare(b.check_at))[0] ?? null
  );
}

export async function markFollowUpDone(userId: string, id: string) {
  const list = await listFollowUps(userId);
  await saveFollowUps(
    userId,
    list.map((f) => (f.id === id ? { ...f, done: true } : f)),
  );
}

export async function expireStaleFollowUps(userId: string, now = Date.now()) {
  const list = await listFollowUps(userId);
  const stale = list.some((f) => !f.done && now - new Date(f.check_at).getTime() > 3 * 24 * 60 * 60 * 1000);
  if (!stale) return;
  await saveFollowUps(
    userId,
    list.map((f) =>
      !f.done && now - new Date(f.check_at).getTime() > 3 * 24 * 60 * 60 * 1000 ? { ...f, done: true } : f,
    ),
  );
}

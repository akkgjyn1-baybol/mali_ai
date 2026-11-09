import { randomUUID } from "crypto";
import { generatePlainText } from "./ai";
import { appendMessages, getConversation, listAllMessages, listUsers } from "./db";
import { drawDream, generateDreamForUser, todaysDream } from "./dreams";
import { dueFollowUp, expireStaleFollowUps, markFollowUpDone } from "./followups";
import { ensureDailyMaliState, todaysMaliState } from "./inner-life";
import { notify } from "./notifications";
import { buildReachOutPrompt, type ReachOutReason } from "./prompts";
import { getMemory, kvDel, kvGet, kvSet, kvSetNx } from "./redis";
import type { ChatMessage, FollowUp, User } from "./types";
import { hourInTimeZone, todayDate } from "./utils";

const HOUR = 60 * 60 * 1000;
const AWAKE_FROM = 9;
const AWAKE_UNTIL = 23;
const DREAM_FROM = 8;
const MISSING_AFTER_HOURS = 20;
const IGNORE_HABITS_AFTER_HOURS = 36;
const MAX_UNANSWERED = 2;

function dreamDayKey(userId: string) {
  return `user:${userId}:dream_day`;
}

function nextRandomKey(userId: string) {
  return `user:${userId}:next_random_at`;
}

function randomBetween(minHours: number, maxHours: number) {
  return (minHours + Math.random() * (maxHours - minHours)) * HOUR;
}

async function scheduleNextRandom(userId: string, now: number) {
  await kvSet(nextRandomKey(userId), new Date(now + randomBetween(8, 30)).toISOString());
}

async function morningRoutine(userId: string, today: string) {
  if ((await kvGet<string>(dreamDayKey(userId))) === today) {
    if (!(await todaysMaliState(userId))) {
      const dream = await todaysDream(userId);
      await ensureDailyMaliState(userId, dream?.content);
    }
    return false;
  }
  await kvSet(dreamDayKey(userId), today);
  try {
    const dream = await generateDreamForUser(userId);
    const image = await drawDream(userId, dream.content);
    await notify(userId, {
      kind: "dream",
      title: "Мали приснился сон",
      body: dream.content,
      url: `/notifications#${dream.id}`,
      ...(image ? { image } : {}),
    });
    await ensureDailyMaliState(userId, dream.content).catch((error) =>
      console.error("[mali] inner life failed", error),
    );
    return true;
  } catch (error) {
    await kvDel(dreamDayKey(userId));
    throw error;
  }
}

/** Is the given hour one the user usually writes in? True when there is too little history to tell. */
export function isUsualHour(messages: ChatMessage[], hour: number, now: number) {
  const since = now - 60 * 24 * HOUR;
  const counts = new Array(24).fill(0);
  let total = 0;
  for (const m of messages) {
    if (m.role !== "user") continue;
    const t = new Date(m.timestamp);
    if (t.getTime() < since) continue;
    counts[hourInTimeZone(t)]++;
    total++;
  }
  if (total < 15) return true;
  const windowAt = (h: number) => counts[(h + 23) % 24] + counts[h] + counts[(h + 1) % 24];
  const best = Math.max(...counts.map((_, h) => windowAt(h)));
  return windowAt(hour) >= Math.max(1, best * 0.25);
}

function pickReason(params: {
  messages: ChatMessage[];
  user: User;
  now: number;
  hour: number;
  nextRandomAt: string | null;
  followUp: FollowUp | null;
}): { reason: ReachOutReason; hoursSilent: number } | null {
  const { messages, now } = params;
  let unanswered = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.isInitiation) unanswered++;
    else if (m.role === "user") break;
  }
  if (unanswered >= MAX_UNANSWERED) return null;

  const last = messages.at(-1);
  if (last && now - new Date(last.timestamp).getTime() < 45 * 60 * 1000) return null;

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastInitiation = [...messages].reverse().find((m) => m.isInitiation);
  const hoursSilent =
    (now - new Date(lastUser?.timestamp ?? params.user.created_at).getTime()) / HOUR;
  const hoursSinceInitiation = lastInitiation
    ? (now - new Date(lastInitiation.timestamp).getTime()) / HOUR
    : Infinity;

  if (params.followUp) return { reason: "followup", hoursSilent };

  const usual = isUsualHour(messages, params.hour, now);
  if (hoursSilent >= MISSING_AFTER_HOURS && hoursSinceInitiation >= MISSING_AFTER_HOURS) {
    if (usual || hoursSilent >= IGNORE_HABITS_AFTER_HOURS) return { reason: "missing", hoursSilent };
  }
  if (usual && params.nextRandomAt && now >= new Date(params.nextRandomAt).getTime()) {
    return { reason: "random", hoursSilent };
  }
  return null;
}

async function reachOut(user: User, now: number, hour: number) {
  const nextRandomAt = await kvGet<string>(nextRandomKey(user.id));
  if (!nextRandomAt) {
    await kvSet(nextRandomKey(user.id), new Date(now + randomBetween(2, 14)).toISOString());
  }

  await expireStaleFollowUps(user.id, now);
  const followUp = await dueFollowUp(user.id, now);
  const messages = await listAllMessages(user.id);
  const picked = pickReason({ messages, user, now, hour, nextRandomAt, followUp });
  if (!picked) return null;

  const [memory, self] = await Promise.all([getMemory(user.id), todaysMaliState(user.id)]);
  const text = await generatePlainText(
    buildReachOutPrompt({
      reason: picked.reason,
      hoursSilent: picked.hoursSilent,
      memory,
      recent: messages.slice(-10),
      self,
      followUp: picked.reason === "followup" ? followUp : null,
    }),
  );
  if (!text) return null;

  const message: ChatMessage = {
    id: randomUUID(),
    role: "assistant",
    content: text,
    timestamp: new Date().toISOString(),
    isInitiation: true,
  };
  const latest = await getConversation(user.id);
  const saved = await appendMessages(user.id, [message], latest?.id);
  if (picked.reason === "followup" && followUp) await markFollowUpDone(user.id, followUp.id);
  else await scheduleNextRandom(user.id, now);
  await notify(user.id, {
    kind: "message",
    title: "Mali",
    body: text,
    url: `/chat?c=${saved.id}`,
  });
  return picked.reason;
}

export async function runTick() {
  if (!(await kvSetNx("scheduler:tick_lock", 1, 240))) {
    return { skipped: true, results: [] };
  }

  const now = Date.now();
  const hour = hourInTimeZone();
  const today = todayDate();
  const results: Array<{ userId: string; dream?: boolean; message?: string | null; error?: string }> = [];

  for (const user of await listUsers()) {
    const result: (typeof results)[number] = { userId: user.id };
    try {
      if (hour >= DREAM_FROM && hour < AWAKE_UNTIL) {
        result.dream = await morningRoutine(user.id, today);
      }
      if (hour >= AWAKE_FROM && hour < AWAKE_UNTIL) {
        result.message = await reachOut(user, now, hour);
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      console.error("[mali] tick failed for", user.id, error);
    }
    results.push(result);
  }

  return { skipped: false, results };
}

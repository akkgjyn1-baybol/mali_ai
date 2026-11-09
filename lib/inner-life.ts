import { generatePlainText } from "./ai";
import { buildInnerLifePrompt } from "./prompts";
import { kvGet, kvSet } from "./redis";
import type { MaliState } from "./types";
import { todayDate } from "./utils";

function stateKey(userId: string) {
  return `user:${userId}:mali_state`;
}

export async function getMaliState(userId: string) {
  return kvGet<MaliState>(stateKey(userId));
}

export async function todaysMaliState(userId: string) {
  const state = await getMaliState(userId);
  return state?.date === todayDate() ? state : null;
}

function cleanList(value: unknown, max: number) {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim().slice(0, 200)).slice(0, max)
    : [];
}

export async function ensureDailyMaliState(userId: string, dream?: string | null) {
  const today = todayDate();
  const previous = await getMaliState(userId);
  if (previous?.date === today) return { state: previous, created: false };

  const raw = await generatePlainText(buildInnerLifePrompt({ previous, dream: dream ?? null }));
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<MaliState>;

  const opinions = cleanList(parsed.opinions, 10);
  const state: MaliState = {
    date: today,
    mood: String(parsed.mood ?? "спокойное").slice(0, 60),
    moodWhy: String(parsed.moodWhy ?? "").slice(0, 200),
    plans: cleanList(parsed.plans, 4),
    thought: String(parsed.thought ?? "").slice(0, 300),
    opinions: opinions.length ? opinions : previous?.opinions ?? [],
  };
  await kvSet(stateKey(userId), state);
  return { state, created: true };
}

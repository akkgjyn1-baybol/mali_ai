import { kvGet, kvIncr } from "./redis";
import { todayDate } from "./utils";

export const DAILY_REQUEST_LIMIT = 500;

export type QuotaModel = {
  id: string;
  role: string;
  daily: number;
  perMinute: number;
  used: number;
  remaining: number;
};

function usageKey(model: string, day = todayDate()) {
  return `quota:${model}:${day}`;
}

export function quotaModels() {
  const primary = process.env.GEMINI_MAIN_MODEL || "gemini-3.5-flash-lite";
  const models = [
    { id: primary, role: "Основная", daily: DAILY_REQUEST_LIMIT, perMinute: 10 },
    { id: "gemini-3.1-flash-lite", role: "Запасная", daily: DAILY_REQUEST_LIMIT, perMinute: 10 },
    {
      id: process.env.GEMINI_SMART_MODEL || "gemini-3.8-flash",
      role: "Для важных разговоров",
      daily: DAILY_REQUEST_LIMIT,
      perMinute: 10,
    },
    { id: "gemini-3.5-flash", role: "Важные разговоры, запасная", daily: DAILY_REQUEST_LIMIT, perMinute: 10 },
  ];
  return models.filter((model, index, list) => list.findIndex((item) => item.id === model.id) === index);
}

export async function noteModelRequest(model: string) {
  try {
    await kvIncr(usageKey(model));
  } catch (error) {
    console.error("Quota count failed", error);
  }
}

export async function readQuota() {
  const models: QuotaModel[] = [];
  for (const model of quotaModels()) {
    const used = Number((await kvGet<number>(usageKey(model.id))) ?? 0);
    models.push({
      ...model,
      used,
      remaining: Math.max(0, model.daily - used),
    });
  }
  return {
    resetsAt: "около 14:00 по времени Кыргызстана",
    models,
  };
}

import { emptyMemory, type Memory } from "./types";
import { readFileDb, withFileDb } from "./local-store";

export const hasKv = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
);

async function kvClient() {
  const { kv } = await import("@vercel/kv");
  return kv;
}

export function memoryKey(userId: string) {
  return `user:${userId}:memory`;
}

export function pendingKey(userId: string) {
  return `user:${userId}:pending_message`;
}

export function initiationCountKey(userId: string, date: string) {
  return `user:${userId}:initiation_count:${date}`;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  if (hasKv) {
    const kv = await kvClient();
    return (await kv.get<T>(key)) ?? null;
  }
  const db = await readFileDb();
  return (db.kv[key] as T) ?? null;
}

export async function kvSet(key: string, value: unknown, exSeconds?: number) {
  if (hasKv) {
    const kv = await kvClient();
    if (exSeconds) {
      await kv.set(key, value, { ex: exSeconds });
    } else {
      await kv.set(key, value);
    }
    return;
  }
  await withFileDb((db) => {
    db.kv[key] = value;
  });
}

export async function kvDel(key: string) {
  if (hasKv) {
    const kv = await kvClient();
    await kv.del(key);
    return;
  }
  await withFileDb((db) => {
    delete db.kv[key];
  });
}

export async function kvSetNx(key: string, value: unknown, exSeconds: number) {
  if (hasKv) {
    const kv = await kvClient();
    return (await kv.set(key, value, { nx: true, ex: exSeconds })) === "OK";
  }
  return withFileDb((db) => {
    const current = db.kv[key] as { until?: number } | undefined;
    if (current && typeof current.until === "number" && current.until > Date.now()) return false;
    db.kv[key] = { value, until: Date.now() + exSeconds * 1000 };
    return true;
  });
}

export async function kvIncr(key: string) {
  if (hasKv) {
    const kv = await kvClient();
    return kv.incr(key);
  }
  return withFileDb((db) => {
    const current = Number(db.kv[key] ?? 0);
    const next = current + 1;
    db.kv[key] = next;
    return next;
  });
}

export async function getMemory(userId: string): Promise<Memory> {
  const stored = await kvGet<Memory>(memoryKey(userId));
  if (stored?.personality_state) return stored;
  const fresh = emptyMemory();
  await setMemory(userId, fresh);
  return fresh;
}

export async function setMemory(userId: string, memory: Memory) {
  await kvSet(memoryKey(userId), memory);
}

export async function getPendingMessage(userId: string) {
  return kvGet<string>(pendingKey(userId));
}

export async function setPendingMessage(userId: string, message: string) {
  await kvSet(pendingKey(userId), message);
}

export async function clearPendingMessage(userId: string) {
  await kvDel(pendingKey(userId));
}

export async function claimPendingMessage(userId: string): Promise<string | null> {
  const key = pendingKey(userId);
  if (hasKv) {
    const kv = await kvClient();
    const client = kv as typeof kv & { getdel?: <T>(key: string) => Promise<T | null> };
    if (typeof client.getdel === "function") {
      const value = await client.getdel<string>(key);
      return typeof value === "string" && value ? value : null;
    }
    const value = await kv.get<string>(key);
    if (typeof value !== "string" || !value) return null;
    await kv.del(key);
    return value;
  }
  return withFileDb((db) => {
    const value = db.kv[key];
    if (typeof value !== "string" || !value) return null;
    delete db.kv[key];
    return value;
  });
}

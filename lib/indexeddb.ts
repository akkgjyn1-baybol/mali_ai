import Dexie, { type Table } from "dexie";
import type { ChatMessage } from "./types";

export type CachedMessage = ChatMessage & {
  userId: string;
  conversationId: string;
};

class MirrorDB extends Dexie {
  messages!: Table<CachedMessage, string>;

  constructor() {
    super("mirror-ai");
    this.version(1).stores({
      messages: "id, userId, timestamp",
    });
    this.version(2).stores({
      messages: "id, userId, conversationId, timestamp",
    });
  }
}

let db: MirrorDB | null = null;

export function getLocalDb() {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is browser-only");
  }
  if (!db) db = new MirrorDB();
  return db;
}

export async function cacheMessages(
  userId: string,
  conversationId: string,
  messages: ChatMessage[],
) {
  const local = getLocalDb();
  await local.messages.where("conversationId").equals(conversationId).delete();
  await local.messages.bulkPut(
    messages.map((m) => ({ ...m, userId, conversationId })),
  );
}

export async function loadCachedMessages(userId: string, conversationId?: string) {
  const local = getLocalDb();
  if (conversationId) {
    return local.messages.where("conversationId").equals(conversationId).sortBy("timestamp");
  }
  return local.messages.where("userId").equals(userId).sortBy("timestamp");
}

export async function cacheMessage(
  userId: string,
  conversationId: string,
  message: ChatMessage,
) {
  const local = getLocalDb();
  await local.messages.put({ ...message, userId, conversationId });
}

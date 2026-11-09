import { AsyncLocalStorage } from "async_hooks";
import { promises as fs } from "fs";
import path from "path";
import type {
  Conversation,
  Dream,
  MemorySnapshot,
  User,
  WeeklyReport,
} from "./types";

type FileDb = {
  users: User[];
  conversations: Conversation[];
  memory_snapshots: MemorySnapshot[];
  dreams: Dream[];
  weekly_reports: WeeklyReport[];
  kv: Record<string, unknown>;
};

function emptyDb(): FileDb {
  return {
    users: [],
    conversations: [],
    memory_snapshots: [],
    dreams: [],
    weekly_reports: [],
    kv: {},
  };
}

const dataDir = path.join(process.cwd(), ".data");
const dataFile = path.join(dataDir, "store.json");
const storage = new AsyncLocalStorage<FileDb>();

let queue: Promise<void> = Promise.resolve();

async function readDb(): Promise<FileDb> {
  try {
    const raw = await fs.readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<FileDb>;
    return {
      users: parsed.users ?? [],
      conversations: parsed.conversations ?? [],
      memory_snapshots: parsed.memory_snapshots ?? [],
      dreams: parsed.dreams ?? [],
      weekly_reports: parsed.weekly_reports ?? [],
      kv: parsed.kv ?? {},
    };
  } catch {
    return emptyDb();
  }
}

async function persist(db: FileDb) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dataFile, JSON.stringify(db, null, 2), "utf8");
}

export async function withFileDb<T>(fn: (db: FileDb) => Promise<T> | T): Promise<T> {
  const existing = storage.getStore();
  if (existing) return fn(existing);

  const run = queue.then(async () => {
    const db = await readDb();
    const value = await storage.run(db, async () => fn(db));
    await persist(db);
    return value;
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function readFileDb(): Promise<FileDb> {
  return storage.getStore() ?? readDb();
}

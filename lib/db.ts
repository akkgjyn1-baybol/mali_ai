import { randomUUID } from "crypto";
import type {
  ChatMessage,
  Conversation,
  Dream,
  DreamReaction,
  MemorySnapshot,
  PersonalityState,
  User,
  WeeklyReport,
} from "./types";
import { DEFAULT_PERSONALITY } from "./types";
import { readFileDb, withFileDb } from "./local-store";
import { withUserLock } from "./lock";
import { conversationTitle, endOfCalendarDay, titleFromText } from "./utils";

const hasPostgres = Boolean(process.env.POSTGRES_URL);

async function sqlClient() {
  const { sql } = await import("@vercel/postgres");
  return sql;
}

let initialized = false;

export async function initDb() {
  if (initialized) return;
  if (!hasPostgres) {
    initialized = true;
    return;
  }
  const sql = await sqlClient();
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      personality_profile JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'Новый чат',
      messages JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Новый чат'`;
  await sql`
    CREATE TABLE IF NOT EXISTS memory_snapshots (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      personality_state JSONB NOT NULL,
      facts JSONB NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS dreams (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      input_summary JSONB NOT NULL,
      user_reaction TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS weekly_reports (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      week_start DATE NOT NULL,
      week_end DATE NOT NULL,
      content TEXT NOT NULL,
      stats JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  initialized = true;
}

export async function createUser(name: string, email?: string | null): Promise<User> {
  await initDb();
  const user: User = {
    id: randomUUID(),
    email: email ?? null,
    name: name.trim() || "Я",
    created_at: new Date().toISOString(),
    personality_profile: { ...DEFAULT_PERSONALITY },
  };

  if (hasPostgres) {
    const sql = await sqlClient();
    await sql`
      INSERT INTO users (id, email, name, created_at, personality_profile)
      VALUES (
        ${user.id},
        ${user.email},
        ${user.name},
        ${user.created_at},
        ${JSON.stringify(user.personality_profile)}::jsonb
      )
    `;
    return user;
  }

  await withFileDb((db) => {
    db.users.push(user);
  });
  return user;
}

export async function getUser(id: string): Promise<User | null> {
  await initDb();
  if (hasPostgres) {
    const sql = await sqlClient();
    const { rows } = await sql`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
    return (rows[0] as User) ?? null;
  }
  const db = await readFileDb();
  return db.users.find((u) => u.id === id) ?? null;
}

export async function listUsers(): Promise<User[]> {
  await initDb();
  if (hasPostgres) {
    const sql = await sqlClient();
    const { rows } = await sql`SELECT * FROM users`;
    return rows as User[];
  }
  const db = await readFileDb();
  return db.users;
}

export async function updateUserPersonality(userId: string, personality: PersonalityState) {
  await initDb();
  if (hasPostgres) {
    const sql = await sqlClient();
    await sql`
      UPDATE users
      SET personality_profile = ${JSON.stringify(personality)}::jsonb
      WHERE id = ${userId}
    `;
    return;
  }
  await withFileDb((db) => {
    const user = db.users.find((u) => u.id === userId);
    if (user) user.personality_profile = personality;
  });
}

function normalizeConversation(row: Conversation): Conversation {
  const messages = row.messages ?? [];
  return {
    ...row,
    messages,
    title: row.title || conversationTitle(messages),
  };
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  await initDb();
  if (hasPostgres) {
    const sql = await sqlClient();
    const { rows } = await sql`
      SELECT * FROM conversations WHERE user_id = ${userId}
      ORDER BY updated_at DESC
    `;
    return (rows as Conversation[]).map(normalizeConversation);
  }
  const db = await readFileDb();
  return db.conversations
    .filter((c) => c.user_id === userId)
    .map(normalizeConversation)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getConversation(
  userId: string,
  conversationId?: string | null,
): Promise<Conversation | null> {
  const all = await listConversations(userId);
  if (conversationId) return all.find((c) => c.id === conversationId) ?? null;
  return all[0] ?? null;
}

export async function createConversation(userId: string, title = "Новый чат") {
  await initDb();
  const now = new Date().toISOString();
  const created: Conversation = {
    id: randomUUID(),
    user_id: userId,
    title,
    messages: [],
    created_at: now,
    updated_at: now,
  };

  if (hasPostgres) {
    const sql = await sqlClient();
    await sql`
      INSERT INTO conversations (id, user_id, title, messages, created_at, updated_at)
      VALUES (
        ${created.id},
        ${created.user_id},
        ${created.title},
        ${JSON.stringify(created.messages)}::jsonb,
        ${created.created_at},
        ${created.updated_at}
      )
    `;
    return created;
  }

  await withFileDb((db) => {
    db.conversations.push(created);
  });
  return created;
}

export async function renameConversation(userId: string, conversationId: string, title: string) {
  await initDb();
  const next = title.trim().slice(0, 80);
  if (!next) throw new Error("Пустое название");
  const now = new Date().toISOString();

  if (hasPostgres) {
    const sql = await sqlClient();
    await sql`
      UPDATE conversations
      SET title = ${next}, updated_at = ${now}
      WHERE id = ${conversationId} AND user_id = ${userId}
    `;
    const saved = await getConversation(userId, conversationId);
    if (!saved) throw new Error("Чат не найден");
    return saved;
  }

  return withFileDb((db) => {
    const found = db.conversations.find((c) => c.id === conversationId && c.user_id === userId);
    if (!found) throw new Error("Чат не найден");
    found.title = next;
    found.updated_at = now;
    return normalizeConversation(found);
  });
}

export async function deleteConversation(userId: string, conversationId: string) {
  await initDb();
  if (hasPostgres) {
    const sql = await sqlClient();
    await sql`DELETE FROM conversations WHERE id = ${conversationId} AND user_id = ${userId}`;
    return;
  }
  await withFileDb((db) => {
    db.conversations = db.conversations.filter(
      (c) => !(c.id === conversationId && c.user_id === userId),
    );
  });
}

export async function saveConversation(
  userId: string,
  conversationId: string,
  messages: ChatMessage[],
  title?: string,
) {
  await initDb();
  const now = new Date().toISOString();
  const nextTitle = title || conversationTitle(messages);

  if (hasPostgres) {
    const sql = await sqlClient();
    await sql`
      UPDATE conversations
      SET messages = ${JSON.stringify(messages)}::jsonb,
          title = ${nextTitle},
          updated_at = ${now}
      WHERE id = ${conversationId} AND user_id = ${userId}
    `;
    const saved = await getConversation(userId, conversationId);
    if (!saved) throw new Error("Чат не найден");
    return saved;
  }

  return withFileDb((db) => {
    const found = db.conversations.find((c) => c.id === conversationId && c.user_id === userId);
    if (!found) throw new Error("Чат не найден");
    found.messages = messages;
    found.title = nextTitle;
    found.updated_at = now;
    return normalizeConversation(found);
  });
}

export async function appendMessages(
  userId: string,
  incoming: ChatMessage[],
  conversationId?: string | null,
) {
  return withUserLock(userId, async () => {
    let conversation = conversationId ? await getConversation(userId, conversationId) : null;
    if (!conversation) {
      const firstUser = incoming.find((m) => m.role === "user");
      conversation = await createConversation(
        userId,
        firstUser ? titleFromText(firstUser.content) : "Новый чат",
      );
    }
    const messages = [...conversation.messages, ...incoming];
    const title =
      !conversation.title || conversation.title === "Новый чат"
        ? conversationTitle(messages, conversation.title)
        : conversation.title;

    if (hasPostgres) {
      const sql = await sqlClient();
      const now = new Date().toISOString();
      await sql`
        UPDATE conversations
        SET messages = COALESCE(messages, '[]'::jsonb) || ${JSON.stringify(incoming)}::jsonb,
            title = CASE
              WHEN title IS NULL OR title = '' OR title = 'Новый чат' THEN ${title}
              ELSE title
            END,
            updated_at = ${now}
        WHERE id = ${conversation.id} AND user_id = ${userId}
      `;
      const saved = await getConversation(userId, conversation.id);
      if (!saved) throw new Error("Чат не найден");
      return saved;
    }

    return saveConversation(userId, conversation.id, messages, title);
  });
}

export async function listAllMessages(userId: string) {
  const all = await listConversations(userId);
  return all
    .flatMap((c) => c.messages)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function getMessagesUntil(userId: string, date: string) {
  const cutoff = endOfCalendarDay(date).getTime();
  return (await listAllMessages(userId)).filter(
    (m) => new Date(m.timestamp).getTime() <= cutoff,
  );
}

export async function insertSnapshot(snapshot: MemorySnapshot) {
  await initDb();
  if (hasPostgres) {
    const sql = await sqlClient();
    await sql`
      DELETE FROM memory_snapshots
      WHERE user_id = ${snapshot.user_id} AND date = ${snapshot.date}::date
    `;
    await sql`
      INSERT INTO memory_snapshots
        (id, user_id, date, personality_state, facts, message_count, created_at)
      VALUES (
        ${snapshot.id},
        ${snapshot.user_id},
        ${snapshot.date},
        ${JSON.stringify(snapshot.personality_state)}::jsonb,
        ${JSON.stringify(snapshot.facts)}::jsonb,
        ${snapshot.message_count},
        ${snapshot.created_at}
      )
    `;
    return;
  }
  await withFileDb((db) => {
    db.memory_snapshots = db.memory_snapshots.filter(
      (s) => !(s.user_id === snapshot.user_id && s.date === snapshot.date),
    );
    db.memory_snapshots.push(snapshot);
  });
}

export async function listSnapshots(userId: string) {
  await initDb();
  if (hasPostgres) {
    const sql = await sqlClient();
    const { rows } = await sql`
      SELECT id, user_id, date::text, personality_state, facts, message_count, created_at
      FROM memory_snapshots
      WHERE user_id = ${userId}
      ORDER BY date ASC
    `;
    return rows as MemorySnapshot[];
  }
  const db = await readFileDb();
  return db.memory_snapshots
    .filter((s) => s.user_id === userId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getSnapshotOnOrBefore(userId: string, date: string) {
  const snapshots = await listSnapshots(userId);
  const eligible = snapshots.filter((s) => s.date <= date);
  return eligible.at(-1) ?? null;
}

export async function insertDream(dream: Dream) {
  await initDb();
  if (hasPostgres) {
    const sql = await sqlClient();
    await sql`
      INSERT INTO dreams (id, user_id, content, input_summary, user_reaction, created_at)
      VALUES (
        ${dream.id},
        ${dream.user_id},
        ${dream.content},
        ${JSON.stringify(dream.input_summary)}::jsonb,
        ${dream.user_reaction},
        ${dream.created_at}
      )
    `;
    return;
  }
  await withFileDb((db) => {
    db.dreams.unshift(dream);
  });
}

export async function listDreams(userId: string) {
  await initDb();
  if (hasPostgres) {
    const sql = await sqlClient();
    const { rows } = await sql`
      SELECT * FROM dreams WHERE user_id = ${userId} ORDER BY created_at DESC
    `;
    return rows as Dream[];
  }
  const db = await readFileDb();
  return db.dreams
    .filter((d) => d.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function updateDreamReaction(id: string, userId: string, reaction: DreamReaction) {
  await initDb();
  if (hasPostgres) {
    const sql = await sqlClient();
    await sql`
      UPDATE dreams SET user_reaction = ${reaction}
      WHERE id = ${id} AND user_id = ${userId}
    `;
    return;
  }
  await withFileDb((db) => {
    const dream = db.dreams.find((d) => d.id === id && d.user_id === userId);
    if (dream) dream.user_reaction = reaction;
  });
}

export async function insertWeeklyReport(report: WeeklyReport) {
  await initDb();
  if (hasPostgres) {
    const sql = await sqlClient();
    await sql`
      INSERT INTO weekly_reports
        (id, user_id, week_start, week_end, content, stats, created_at)
      VALUES (
        ${report.id},
        ${report.user_id},
        ${report.week_start},
        ${report.week_end},
        ${report.content},
        ${JSON.stringify(report.stats)}::jsonb,
        ${report.created_at}
      )
    `;
    return;
  }
  await withFileDb((db) => {
    db.weekly_reports.unshift(report);
  });
}

export async function listWeeklyReports(userId: string) {
  await initDb();
  if (hasPostgres) {
    const sql = await sqlClient();
    const { rows } = await sql`
      SELECT * FROM weekly_reports
      WHERE user_id = ${userId}
      ORDER BY week_start DESC
    `;
    return rows as WeeklyReport[];
  }
  const db = await readFileDb();
  return db.weekly_reports
    .filter((r) => r.user_id === userId)
    .sort((a, b) => b.week_start.localeCompare(a.week_start));
}

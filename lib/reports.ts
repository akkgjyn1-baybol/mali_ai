import { randomUUID } from "crypto";
import { generatePlainText } from "./ai";
import { insertWeeklyReport, listAllMessages, listSnapshots } from "./db";
import { buildWeeklyReportPrompt } from "./prompts";
import { getMemory } from "./redis";
import { calendarDate, personalityDelta, weekRange } from "./utils";
import type { WeeklyReport } from "./types";

export async function generateWeeklyReportForUser(userId: string): Promise<WeeklyReport> {
  const { start, end } = weekRange();
  const memory = await getMemory(userId);
  const messages = (await listAllMessages(userId)).filter((m) => {
    const day = calendarDate(m.timestamp);
    return day >= start && day <= end;
  });
  const userMessages = messages.filter((m) => m.role === "user");
  const weekFacts = memory.facts.filter((f) => f.date >= start && f.date <= end);

  const topicCounts = new Map<string, number>();
  for (const topic of memory.recentTopics) {
    if (topic.date >= start) {
      topicCounts.set(topic.topic, (topicCounts.get(topic.topic) ?? 0) + 1);
    }
  }
  const recurring = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([topic, count]) => `${topic} (${count})`)
    .join("\n");

  const selfReferences = userMessages
    .filter((m) => /\b(я|мне|меня|мой|моя|моё|себе)\b/i.test(m.content))
    .slice(-8)
    .map((m) => `"${m.content.slice(0, 140)}"`)
    .join("\n");

  const snapshots = await listSnapshots(userId);
  const weekStartSnapshot = snapshots.find((s) => s.date >= start);
  const delta = personalityDelta(
    memory.personality_state,
    weekStartSnapshot?.personality_state,
  );

  const emotionalTrend =
    memory.personality_state.positiveRatio > 0.6
      ? "скорее светлый"
      : memory.personality_state.positiveRatio < 0.4
        ? "скорее тревожный"
        : "смешанный";

  const content = await generatePlainText(
    buildWeeklyReportPrompt({
      messageCount: userMessages.length,
      newFactsCount: weekFacts.length,
      emotionalTrend,
      recurringTopics: recurring,
      selfReferences,
      warmthDelta: delta.warmth,
      directnessDelta: delta.directness,
      facts: weekFacts.map((f) => `- ${f.text}`).join("\n"),
    }),
  );

  const report: WeeklyReport = {
    id: randomUUID(),
    user_id: userId,
    week_start: start,
    week_end: end,
    content,
    stats: {
      messageCount: userMessages.length,
      newFactsCount: weekFacts.length,
      topTopics: Array.from(topicCounts.keys()).slice(0, 5),
      emotionalTrend,
    },
    created_at: new Date().toISOString(),
  };

  await insertWeeklyReport(report);
  return report;
}

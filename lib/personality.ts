import { clamp01, round2, todayDate } from "./utils";
import type { Memory, MessageAnalysis, PersonalityState } from "./types";

export function updatePersonality(
  currentState: PersonalityState,
  analysis: MessageAnalysis,
): PersonalityState {
  const next: PersonalityState = { ...currentState };

  if (analysis.tone === "negative" && analysis.emotion === "anger") {
    next.warmth = clamp01(next.warmth - 0.1);
    next.directness = clamp01(next.directness + 0.1);
  }

  if (analysis.openness > 0.7) {
    next.warmth = clamp01(next.warmth + 0.15);
    next.empathy = clamp01(next.empathy + 0.1);
    next.formality = clamp01(next.formality - 0.05);
  }

  if (analysis.tone === "positive") {
    next.positiveRatio =
      (next.positiveRatio * next.interactionCount + 1) /
      (next.interactionCount + 1);
    next.warmth = clamp01(next.warmth + 0.05);
  } else {
    next.positiveRatio =
      (next.positiveRatio * next.interactionCount) /
      (next.interactionCount + 1);
  }

  if (analysis.emotion === "sadness" || analysis.emotion === "anxiety") {
    next.empathy = clamp01(next.empathy + 0.05);
  }

  next.interactionCount += 1;
  next.lastInteraction = new Date().toISOString();

  next.warmth = round2(next.warmth);
  next.directness = round2(next.directness);
  next.formality = round2(next.formality);
  next.empathy = round2(next.empathy);
  next.positiveRatio = round2(next.positiveRatio);

  return next;
}

export function applyAnalysisToMemory(
  memory: Memory,
  analysis: MessageAnalysis,
  sourceMessageId?: string,
): Memory {
  const date = todayDate();
  const facts = [...memory.facts];

  for (const fact of analysis.new_facts) {
    const text = fact.text.trim();
    if (!text) continue;
    const duplicate = facts.some(
      (f) => f.text.toLowerCase() === text.toLowerCase(),
    );
    if (duplicate) continue;
    facts.push({
      text,
      date,
      confidence: clamp01(fact.confidence),
      source_message_id: sourceMessageId,
    });
  }

  const recentTopics = [...memory.recentTopics];
  for (const topic of analysis.topics) {
    const clean = topic.trim().toLowerCase();
    if (!clean) continue;
    const existing = recentTopics.findIndex((t) => t.topic === clean);
    if (existing >= 0) recentTopics.splice(existing, 1);
    recentTopics.unshift({ topic: clean, date });
  }

  const unresolved = new Set(memory.unresolvedTopics);
  for (const item of analysis.unresolved) {
    const clean = item.trim();
    if (clean) unresolved.add(clean);
  }

  return {
    facts: facts.slice(-80),
    personality_state: updatePersonality(memory.personality_state, analysis),
    recentTopics: recentTopics.slice(0, 20),
    unresolvedTopics: Array.from(unresolved).slice(-15),
    initiationIgnoreStreak: 0,
  };
}

export type PersonalityState = {
  warmth: number;
  directness: number;
  formality: number;
  empathy: number;
  lastInteraction: string;
  interactionCount: number;
  positiveRatio: number;
};

export type Fact = {
  text: string;
  date: string;
  confidence: number;
  source_message_id?: string;
};

export type RecentTopic = {
  topic: string;
  date: string;
};

export type Memory = {
  facts: Fact[];
  personality_state: PersonalityState;
  recentTopics: RecentTopic[];
  unresolvedTopics: string[];
  initiationIgnoreStreak?: number;
};

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  isInitiation?: boolean;
  images?: string[];
  reaction?: string;
};

export type FollowUp = {
  id: string;
  about: string;
  question: string;
  check_at: string;
  created_at: string;
  done: boolean;
};

export type MaliState = {
  date: string;
  mood: string;
  moodWhy: string;
  plans: string[];
  thought: string;
  opinions: string[];
};

export type User = {
  id: string;
  email: string | null;
  name: string;
  created_at: string;
  personality_profile: PersonalityState;
};

export type Conversation = {
  id: string;
  user_id: string;
  title: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  updated_at: string;
  preview: string;
};

export type MemorySnapshot = {
  id: string;
  user_id: string;
  date: string;
  personality_state: PersonalityState;
  facts: Fact[];
  message_count: number;
  created_at: string;
};

export type DreamReaction = "liked" | "disliked" | "ignored";

export type Dream = {
  id: string;
  user_id: string;
  content: string;
  input_summary: {
    topics: string[];
    emotions: string[];
    messageCount: number;
  };
  user_reaction: DreamReaction | null;
  created_at: string;
};

export type WeeklyReport = {
  id: string;
  user_id: string;
  week_start: string;
  week_end: string;
  content: string;
  stats: {
    messageCount: number;
    newFactsCount: number;
    topTopics: string[];
    emotionalTrend: string;
  };
  created_at: string;
};

export type NotificationKind = "message" | "dream" | "test";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  url: string;
  image?: string;
  read: boolean;
  created_at: string;
};

export type Tone = "positive" | "negative" | "neutral";
export type Emotion = "joy" | "anger" | "sadness" | "anxiety" | "calm";

export type MessageAnalysis = {
  new_facts: Array<{ text: string; confidence: number }>;
  tone: Tone;
  emotion: Emotion;
  openness: number;
  topics: string[];
  unresolved: string[];
};

export const DEFAULT_PERSONALITY: PersonalityState = {
  warmth: 0.55,
  directness: 0.4,
  formality: 0.2,
  empathy: 0.55,
  lastInteraction: new Date().toISOString(),
  interactionCount: 0,
  positiveRatio: 0.5,
};

export function emptyMemory(): Memory {
  return {
    facts: [],
    personality_state: { ...DEFAULT_PERSONALITY, lastInteraction: new Date().toISOString() },
    recentTopics: [],
    unresolvedTopics: [],
    initiationIgnoreStreak: 0,
  };
}

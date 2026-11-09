import { google } from "@ai-sdk/google";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { updateUserPersonality } from "./db";
import { friendlyGeminiError } from "./gemini-error";
import { withUserLock } from "./lock";
import { buildFactExtractionPrompt } from "./prompts";
import { noteModelRequest } from "./quota";
import { getMemory, setMemory } from "./redis";
import type { ChatMessage, Memory, MessageAnalysis } from "./types";

export const FAST_MODEL = process.env.GEMINI_FAST_MODEL ?? "gemini-3.5-flash-lite";
export const MAIN_MODEL = process.env.GEMINI_MAIN_MODEL ?? "gemini-3.5-flash-lite";

export const SMART_MODEL = process.env.GEMINI_SMART_MODEL ?? "gemini-3.8-flash";

function uniqueModels(models: string[]) {
  return models.filter((model, index, list) => model && list.indexOf(model) === index);
}

const MODEL_FALLBACKS = uniqueModels([MAIN_MODEL, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]);
export const SMART_MODELS = uniqueModels([SMART_MODEL, "gemini-3.5-flash", ...MODEL_FALLBACKS]);

const HEAVY_RE =
  /груст|тяжел|тяжёл|плох|депресс|тревог|страшн|боюсь|одинок|расстал|развод|умер|смерт|болит|болею|плач|ненави|люблю|помоги|не знаю,? что делать|ссор|паник|устал от|смысл|потерял|предал|обидел|сорвал|больниц|стыдно|виноват/i;

export function needsSmartModel(text: string, history: ChatMessage[]) {
  if (text.length >= 280) return true;
  if (HEAVY_RE.test(text)) return true;
  const recentUser = history.filter((m) => m.role === "user").slice(-2);
  return recentUser.some((m) => m.content.length >= 400);
}

export type ImageMap = Record<string, { mime: string; data: string }>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function requireGeminiKey() {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) {
    throw new Error(
      "Нет GOOGLE_GENERATIVE_AI_API_KEY. Добавь ключ в .env.local или в Environment Variables на Vercel.",
    );
  }
  return key;
}

export async function generatePlainText(prompt: string, model = MAIN_MODEL) {
  requireGeminiKey();
  let lastError: unknown = null;
  for (const candidate of uniqueModels([model, ...MODEL_FALLBACKS, "gemini-flash-lite-latest"])) {
    try {
      const { text } = await generateText({
        model: google(candidate),
        prompt,
        maxRetries: 0,
      });
      if (text.trim()) return text.trim();
    } catch (error) {
      lastError = error;
    } finally {
      await noteModelRequest(candidate);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini не ответил");
}

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export function prepareGeminiContents(messages: ChatMessage[], images: ImageMap = {}) {
  const turns: { role: "user" | "model"; parts: GeminiPart[] }[] = [];
  for (const message of messages) {
    const parts: GeminiPart[] = [];
    for (const id of message.images ?? []) {
      const image = images[id];
      if (image) parts.push({ inlineData: { mimeType: image.mime, data: image.data } });
      else parts.push({ text: "[фото]" });
    }
    const text = message.content.trim();
    if (text) parts.push({ text });
    if (!parts.length) continue;
    const role = message.role === "assistant" ? "model" : "user";
    const last = turns[turns.length - 1];
    if (last?.role === role) last.parts.push(...parts);
    else turns.push({ role, parts });
  }
  if (turns[0]?.role === "model") {
    turns.unshift({ role: "user", parts: [{ text: "Продолжи разговор." }] });
  }
  return turns;
}

function looksTruncated(text: string, finishReason: string) {
  if (finishReason !== "MAX_TOKENS") return false;
  const trimmed = text.trim();
  return !trimmed || !/[.!?…»"]$/.test(trimmed);
}

const DEADLINE_MS = 50_000;
const ATTEMPT_MS = 24_000;

type GeminiSuccess = { ok: true; text: string; finishReason: string; model: string };
type GeminiFailure = {
  ok: false;
  error: string;
  overloaded: boolean;
  thinkingRejected: boolean;
  searchRejected: boolean;
  quotaExhausted: boolean;
};

function dailyQuotaError(errorText: string) {
  return /per day|free tier|quota exceeded/i.test(errorText);
}

function searchRejectedError(errorText: string) {
  return /google[\s_-]?search|search grounding|grounding/i.test(errorText);
}

function generationBody(
  system: string,
  messages: ChatMessage[],
  disableThinking: boolean,
  useSearch: boolean,
  images?: ImageMap,
) {
  const generationConfig: Record<string, unknown> = {
    temperature: 0.8,
    maxOutputTokens: 2048,
  };
  if (disableThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  return {
    system_instruction: { parts: [{ text: system }] },
    contents: prepareGeminiContents(messages, images),
    generationConfig,
    ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
  };
}

async function readGeminiSse(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let finishReason = "";

  const take = (raw: string) => {
    const line = raw.trim();
    if (!line || line === "[DONE]") return;
    const data = line.startsWith("data:") ? line.slice(5).trim() : line;
    if (!data.startsWith("{")) return;
    try {
      const json = JSON.parse(data);
      const candidate = json?.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const piece = parts
        .filter((part: { thought?: boolean }) => !part.thought)
        .map((part: { text?: string }) => part.text ?? "")
        .join("");
      if (piece) text += piece;
      if (typeof candidate?.finishReason === "string") finishReason = candidate.finishReason;
    } catch {
      // ignore a partial SSE frame
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) take(line);
  }
  if (buffer) take(buffer);
  return { text, finishReason };
}

async function completeWithModel(params: {
  model: string;
  system: string;
  messages: ChatMessage[];
  apiKey: string;
  disableThinking: boolean;
  useSearch: boolean;
  timeoutMs: number;
  images?: ImageMap;
}): Promise<GeminiSuccess | GeminiFailure> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:streamGenerateContent?alt=sse`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": params.apiKey,
      },
      body: JSON.stringify(
        generationBody(
          params.system,
          params.messages,
          params.disableThinking,
          params.useSearch,
          params.images,
        ),
      ),
    });
    await noteModelRequest(params.model);

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => response.statusText);
      const thinkingRejected =
        response.status === 400 && params.disableThinking && /thinking/i.test(errorText);
      const overloaded =
        response.status === 503 ||
        response.status === 429 ||
        /high demand|UNAVAILABLE/i.test(errorText);
      const quotaExhausted = response.status === 429 && dailyQuotaError(errorText);
      return {
        ok: false,
        error: errorText || response.statusText,
        overloaded: overloaded && !quotaExhausted,
        thinkingRejected,
        searchRejected:
          !thinkingRejected &&
          !quotaExhausted &&
          params.useSearch &&
          (response.status === 400 || searchRejectedError(errorText)),
        quotaExhausted,
      };
    }

    const parsed = await readGeminiSse(response);
    if (!parsed.text.trim()) {
      return {
        ok: false,
        error: "Модель вернула пустой ответ",
        overloaded: false,
        thinkingRejected: false,
        searchRejected: params.useSearch,
        quotaExhausted: false,
      };
    }
    if (looksTruncated(parsed.text, parsed.finishReason)) {
      return {
        ok: false,
        error: "truncated",
        overloaded: false,
        thinkingRejected: false,
        searchRejected: false,
        quotaExhausted: false,
      };
    }
    return { ok: true, text: parsed.text, finishReason: parsed.finishReason || "STOP", model: params.model };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      error: aborted ? "timeout" : error instanceof Error ? error.message : "Ошибка Gemini",
      overloaded: aborted,
      thinkingRejected: false,
      searchRejected: false,
      quotaExhausted: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function generateGeminiReply(
  system: string,
  messages: ChatMessage[],
  apiKey: string,
  useSearch: boolean,
  options: { models?: string[]; images?: ImageMap } = {},
) {
  if (!prepareGeminiContents(messages).length) {
    throw new Error("Нет текста для модели");
  }

  const started = Date.now();
  const deadline = started + DEADLINE_MS;
  let lastError = "";
  let success: GeminiSuccess | null = null;
  let search = useSearch;
  const models = options.models?.length ? options.models : MODEL_FALLBACKS;

  for (const model of models) {
    if (Date.now() > deadline - 1500) break;
    const premium = !MODEL_FALLBACKS.includes(model);
    let disableThinking = false;
    for (let attempt = 0; attempt < (premium ? 1 : 3); attempt++) {
      const timeoutMs = Math.min(premium ? 15_000 : ATTEMPT_MS, deadline - Date.now());
      if (timeoutMs < 1500) break;
      const result = await completeWithModel({
        model,
        system,
        messages,
        apiKey,
        disableThinking,
        useSearch: search,
        timeoutMs,
        images: options.images,
      });
      if (result.ok) {
        success = result;
        break;
      }
      lastError = result.error;
      if (result.quotaExhausted || premium) break;
      if (result.searchRejected && search) {
        search = false;
        continue;
      }
      if (result.thinkingRejected && disableThinking) {
        disableThinking = false;
        continue;
      }
      const timedOut = /timeout/i.test(result.error);
      if (timedOut && search) {
        search = false;
        continue;
      }
      if (timedOut) break;
      if (result.overloaded && attempt === 0) {
        await sleep(400);
        continue;
      }
      break;
    }
    if (success || (!premium && dailyQuotaError(lastError))) break;
  }

  if (!success) {
    const raw = /timeout/i.test(lastError)
      ? "Gemini не ответил вовремя. Попробуй ещё раз."
      : lastError === "truncated"
        ? "Ответ модели оборвался. Попробуй ещё раз."
        : lastError;
    throw new Error(friendlyGeminiError(raw || "Gemini недоступен"));
  }
  console.log(
    `[mali] using ${success.model} finish ${success.finishReason} chars ${success.text.length} after ${Date.now() - started}ms`,
  );
  return success.text;
}

type FinishMeta = {
  conversationId?: string;
  reply?: { parts: Array<{ id: string; content: string; images?: string[] }>; reaction?: string };
};

export function streamGeminiChat(params: {
  system: string;
  messages: ChatMessage[];
  search?: boolean;
  models?: string[];
  images?: ImageMap;
  headers?: HeadersInit;
  onFinish?: (text: string) => Promise<FinishMeta | void> | FinishMeta | void;
}) {
  const apiKey = requireGeminiKey();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (line: string) => controller.enqueue(encoder.encode(`${line}\n`));
      let saved = false;
      try {
        const full = await generateGeminiReply(
          params.system,
          params.messages,
          apiKey,
          params.search !== false,
          { models: params.models, images: params.images },
        );
        send(`0:${JSON.stringify(full)}`);
        if (params.onFinish) {
          const meta = await params.onFinish(full);
          saved = true;
          if (meta && typeof meta === "object") {
            if (meta.reply) send(`m:${JSON.stringify(meta.reply)}`);
            if (meta.conversationId) send(`c:${JSON.stringify(meta.conversationId)}`);
          }
        }
        send(`d:${JSON.stringify({ finishReason: "stop" })}`);
      } catch (error) {
        const raw = error instanceof Error ? error.message : "Ошибка Gemini";
        const message = friendlyGeminiError(raw);
        console.error("[mali] gemini stream failed", message);
        if (!saved) send(`3:${JSON.stringify(message)}`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      ...params.headers,
    },
  });
}

const analysisSchema = z.object({
  new_facts: z.array(
    z.object({
      text: z.string(),
      confidence: z.number().min(0).max(1).default(0.7),
    }),
  ),
  tone: z.enum(["positive", "negative", "neutral"]),
  emotion: z.enum(["joy", "anger", "sadness", "anxiety", "calm"]),
  openness: z.number().min(0).max(1),
  topics: z.array(z.string()).default([]),
  unresolved: z.array(z.string()).default([]),
});

export async function extractFactsAndTone(
  userMessage: string,
  memory: Memory,
): Promise<MessageAnalysis> {
  requireGeminiKey();
  try {
    const { object } = await generateObject({
      model: google(FAST_MODEL),
      schema: analysisSchema,
      prompt: buildFactExtractionPrompt(userMessage, memory),
      maxRetries: 0,
    });
    return object;
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    if (dailyQuotaError(raw)) throw error;
    const text = await generatePlainText(buildFactExtractionPrompt(userMessage, memory), FAST_MODEL);
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    return analysisSchema.parse(parsed);
  }
}

export async function recordExchangeMemory(userId: string) {
  await withUserLock(userId, async () => {
    const latest = await getMemory(userId);
    latest.personality_state = {
      ...latest.personality_state,
      interactionCount: latest.personality_state.interactionCount + 1,
      lastInteraction: new Date().toISOString(),
    };
    await setMemory(userId, latest);
    await updateUserPersonality(userId, latest.personality_state);
  });
}

import { friendlyGeminiError } from "./gemini-error";

function errorFromStreamLine(line: string) {
  const payload = line.slice(2);
  try {
    const parsed = JSON.parse(payload);
    if (typeof parsed === "string") return friendlyGeminiError(parsed);
    if (parsed && typeof parsed === "object") {
      const nested = parsed.errorMessage || parsed.error || parsed.message || payload;
      return friendlyGeminiError(typeof nested === "string" ? nested : JSON.stringify(nested));
    }
  } catch {
    return friendlyGeminiError(payload);
  }
  return friendlyGeminiError(payload);
}

export type ReplyMeta = {
  parts: Array<{ id: string; content: string; images?: string[] }>;
  reaction?: string;
};

type StreamState = {
  text: string;
  streamError: string;
  conversationId: string;
  reply: ReplyMeta | null;
};

function consumeLine(raw: string, state: StreamState, onDelta: (text: string) => void) {
  const line = raw.trim();
  if (!line) return;
  if (line.startsWith("0:")) {
    const piece = JSON.parse(line.slice(2));
    state.text += typeof piece === "string" ? piece : "";
    onDelta(state.text);
  } else if (line.startsWith("c:")) {
    const parsed = JSON.parse(line.slice(2));
    if (typeof parsed === "string") state.conversationId = parsed;
  } else if (line.startsWith("m:")) {
    const parsed = JSON.parse(line.slice(2));
    if (Array.isArray(parsed?.parts)) state.reply = parsed;
  } else if (line.startsWith("3:") || line.startsWith("e:")) {
    const message = errorFromStreamLine(line);
    state.streamError = typeof message === "string" ? message : "Ошибка модели";
  }
}

export async function readTextStream(
  response: Response,
  onDelta: (text: string) => void,
) {
  if (!response.body) {
    throw new Error("Пустой ответ сервера");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const state: StreamState = { text: "", streamError: "", conversationId: "", reply: null };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consumeLine(line, state, onDelta);
  }
  if (buffer) consumeLine(buffer, state, onDelta);

  if (state.streamError) throw new Error(state.streamError);
  if (!state.text.trim()) {
    throw new Error("Модель вернула пустой ответ. Проверь ключ и название модели в .env.local.");
  }

  return { text: state.text, conversationId: state.conversationId, reply: state.reply };
}

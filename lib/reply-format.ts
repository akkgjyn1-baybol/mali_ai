export const REACTIONS = ["❤️", "😂", "😮", "😢", "🔥", "👍", "🥺"];

const REACTION_RE = /^\s*\[\s*реакция\s*:\s*([^\]\n]{1,12})\]\s*/i;
const SPLIT_RE = /\s*\|\|\|\s*/;
const MAX_PARTS = 3;

const DRAWING_RE = /\[\s*рисунок\s*:\s*([^\]]{3,1500})\]/i;

export function parseReply(raw: string) {
  let text = raw.trim();
  let reaction: string | undefined;
  let drawing: string | undefined;
  const drawingMatch = DRAWING_RE.exec(text);
  if (drawingMatch) {
    drawing = drawingMatch[1].trim();
    text = text.replace(DRAWING_RE, "").trim();
  }
  const match = REACTION_RE.exec(text);
  if (match) {
    const candidate = match[1].trim();
    if (REACTIONS.includes(candidate)) reaction = candidate;
    text = text.slice(match[0].length);
  }
  text = text.replace(/\[\s*реакция\s*:[^\]\n]*\]/gi, "").trim();

  const pieces = text
    .split(SPLIT_RE)
    .map((part) => part.trim())
    .filter(Boolean);
  const parts =
    pieces.length > MAX_PARTS
      ? [...pieces.slice(0, MAX_PARTS - 1), pieces.slice(MAX_PARTS - 1).join("\n\n")]
      : pieces;

  return { reaction, drawing, parts: parts.length ? parts : [text] };
}

export function typingDelayMs(text: string) {
  return Math.min(2600, 500 + text.length * 25);
}

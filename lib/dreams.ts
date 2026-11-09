import { randomUUID } from "crypto";
import { FAST_MODEL, generatePlainText } from "./ai";
import { insertDream, listDreams } from "./db";
import { canDraw, drawImage } from "./drawing";
import { buildDreamPrompt } from "./prompts";
import type { Dream } from "./types";
import { calendarDate } from "./utils";

const PLACES = [
  "бесконечный супермаркет ночью",
  "маяк посреди пустыни",
  "школа, где все коридоры ведут на крышу",
  "поезд, который едет по дну океана",
  "библиотека из облаков",
  "заброшенный парк аттракционов на Луне",
  "огромная кухня бабушки размером с город",
  "аэропорт, где никто никуда не улетает",
  "лес из фонарных столбов",
  "подъезд, в котором бесконечные этажи",
  "рынок, где торгуют воспоминаниями",
  "горы в Кыргызстане, но снег был тёплым",
];

const THINGS = [
  "говорящий кот в пиджаке",
  "часы, которые шли назад и пахли корицей",
  "рыбы, плавающие по воздуху",
  "дверь, нарисованная мелом, которая открылась",
  "телефон, по которому звонила я сама из будущего",
  "дождь из мелких пуговиц",
  "пианино без клавиш, которое всё равно играло",
  "огромная улитка вместо автобуса",
  "чемодан, внутри которого было море",
  "зеркало, в котором отражалось утро, хотя была ночь",
  "лестница из книг",
  "снеговик, который продавал мороженое",
];

const TWISTS = [
  "я вдруг умела летать, но только задом наперёд",
  "все вокруг говорили только шёпотом и песнями",
  "я опаздывала куда-то, но не знала куда",
  "оказалось, что я там работаю уже сто лет",
  "в какой-то момент всё стало чёрно-белым",
  "мне нужно было найти ключ, а он всё время менялся",
  "время то ускорялось, то замирало",
  "я была очень маленькой, размером с чашку",
  "кто-то незнакомый был уверен, что мы лучшие друзья",
  "гравитация выключалась каждые пять минут",
];

const MOODS = ["уютное", "тревожное", "смешное", "грустное и светлое", "загадочное", "абсурдное"];

function pick<T>(list: T[]) {
  return list[Math.floor(Math.random() * list.length)];
}

export async function generateDreamForUser(userId: string): Promise<Dream> {
  const seeds = { place: pick(PLACES), thing: pick(THINGS), twist: pick(TWISTS), mood: pick(MOODS) };
  const content = await generatePlainText(buildDreamPrompt(seeds));

  const dream: Dream = {
    id: randomUUID(),
    user_id: userId,
    content,
    input_summary: {
      topics: [seeds.place, seeds.thing],
      emotions: [seeds.mood],
      messageCount: 0,
    },
    user_reaction: null,
    created_at: new Date().toISOString(),
  };

  await insertDream(dream);
  return dream;
}

const DREAM_STYLE =
  "dreamy surreal watercolor illustration, soft muted colors, gentle grain, storybook mood, no text, no letters";

async function sceneForImage(content: string) {
  try {
    const scene = await generatePlainText(
      `Turn this dream into ONE short English prompt for an image generator (max 60 words).
Describe only the most striking visual scene: place, objects, colors, light. No names, no text in the image.
Return only the prompt.

Dream: ${content}`,
      FAST_MODEL,
    );
    return scene.replace(/^["'`]+|["'`]+$/g, "").slice(0, 600);
  } catch {
    return content.slice(0, 600);
  }
}

export async function drawDream(userId: string, content: string) {
  if (!canDraw()) return null;
  const scene = await sceneForImage(content);
  return drawImage(userId, `${scene}. ${DREAM_STYLE}`);
}

export async function todaysDream(userId: string) {
  const today = calendarDate();
  const latest = (await listDreams(userId))[0];
  return latest && calendarDate(latest.created_at) === today ? latest : null;
}

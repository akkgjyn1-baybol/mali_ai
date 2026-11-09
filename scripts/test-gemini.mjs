import { readFileSync } from "fs";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

process.env.GOOGLE_GENERATIVE_AI_API_KEY = env.GOOGLE_GENERATIVE_AI_API_KEY;
const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
console.log("key prefix:", key.slice(0, 4), "len:", key.length);

const models = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-1.5-flash",
];

for (const model of models) {
  try {
    const { text } = await generateText({
      model: google(model),
      prompt: "Say hi in one word",
    });
    console.log("OK", model, "=>", JSON.stringify(text).slice(0, 80));
    break;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("FAIL", model, "=>", msg.slice(0, 300));
  }
}

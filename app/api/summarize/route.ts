import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";

// Two hours in seconds
const MAX_VIDEO_SECONDS = 2 * 60 * 60;

// Extract video ID from any YouTube URL format
function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1).split("?")[0];
    if (parsed.hostname.includes("youtube.com")) return parsed.searchParams.get("v");
    return null;
  } catch {
    return null;
  }
}

// Fetch transcript via Supadata API, which handles YouTube access from residential IPs.
async function fetchTranscript(videoId: string): Promise<{ text: string; duration: number }[]> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) throw new Error("SUPADATA_API_KEY is not set");

  const res = await fetch(
    `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&lang=en`,
    { headers: { "x-api-key": apiKey } }
  );

  if (res.status === 404) throw new Error("No captions found for this video");
  if (!res.ok) throw new Error(`Supadata API returned ${res.status}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();

  // Response shape: { content: [{ text, offset, duration }], lang, availableLangs }
  const segments: { text: string; duration: number; offset: number }[] = data.content ?? [];

  const items = segments
    .filter((s) => s.text?.trim())
    .map((s) => ({ text: s.text.trim(), duration: s.duration ?? 0 }));

  if (!items.length) throw new Error("Transcript is empty");
  return items;
}

export async function POST(req: NextRequest) {
  // --- Auth check ---
  const password = req.headers.get("x-app-password");
  if (!password || password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Parse body ---
  let url: string;
  try {
    const body = await req.json();
    url = body.url;
    if (!url || typeof url !== "string") throw new Error("bad url");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return NextResponse.json({ error: "Could not extract video ID from URL." }, { status: 400 });
  }

  // --- Fetch transcript ---
  let transcriptItems: { text: string; duration: number }[];
  try {
    transcriptItems = await fetchTranscript(videoId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();
    if (
      lower.includes("no captions") ||
      lower.includes("not available") ||
      lower.includes("private") ||
      lower.includes("no valid caption") ||
      lower.includes("transcript is empty")
    ) {
      return NextResponse.json(
        { error: "No transcript available for this video (captions may be disabled or the video is private)." },
        { status: 422 }
      );
    }
    return NextResponse.json({ error: "Failed to fetch transcript: " + msg }, { status: 502 });
  }

  // Build plain-text transcript and check video length
  const transcriptText = transcriptItems.map((t) => t.text).join(" ");
  const totalSeconds = transcriptItems.reduce((sum, t) => sum + (t.duration ?? 0), 0) / 1000;
  const videoTooLong = totalSeconds > MAX_VIDEO_SECONDS;

  const transcriptCharCount = transcriptText.length;
  const transcriptWordCount = transcriptText.trim().split(/\s+/).length;

  // --- Load prompt from file ---
  let promptTemplate: string;
  try {
    const promptPath = path.join(process.cwd(), "prompts", "summarize.md");
    promptTemplate = await fs.readFile(promptPath, "utf-8");
  } catch {
    return NextResponse.json(
      { error: "Server misconfiguration: prompt file missing." },
      { status: 500 }
    );
  }

  // Compose the full prompt
  const userPrompt = `${promptTemplate}\n\n## Transcript\n\n${transcriptText}`;

  // --- Call Claude ---
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let summary: string;
  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = message.content[0];
    if (block.type !== "text") throw new Error("Unexpected response type from Claude.");
    summary = block.text;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Claude API error: " + msg }, { status: 502 });
  }

  return NextResponse.json({
    summary,
    transcriptCharCount,
    transcriptWordCount,
    videoTooLong,
  });
}

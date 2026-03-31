import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";

// Two hours in seconds
const MAX_VIDEO_SECONDS = 2 * 60 * 60;

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

  // --- Fetch transcript ---
  let transcriptItems: { text: string; duration: number }[];
  try {
    transcriptItems = await YoutubeTranscript.fetchTranscript(url);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("disabled") || msg.toLowerCase().includes("available")) {
      return NextResponse.json(
        { error: "No transcript available for this video (captions may be disabled or the video is private)." },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch transcript: " + msg },
      { status: 502 }
    );
  }

  if (!transcriptItems.length) {
    return NextResponse.json(
      { error: "Transcript is empty — nothing to summarize." },
      { status: 422 }
    );
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
    return NextResponse.json(
      { error: "Claude API error: " + msg },
      { status: 502 }
    );
  }

  return NextResponse.json({
    summary,
    transcriptCharCount,
    transcriptWordCount,
    videoTooLong,
  });
}

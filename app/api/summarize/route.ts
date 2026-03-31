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

// Fetch transcript by scraping the YouTube watch page directly with browser-like
// headers. This avoids IP-based blocks that affect cloud-hosted third-party packages.
async function fetchTranscript(videoId: string): Promise<{ text: string; duration: number }[]> {
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!pageRes.ok) throw new Error(`YouTube page returned ${pageRes.status}`);
  const html = await pageRes.text();

  // Pull the captionTracks array out of the embedded player JSON
  const marker = '"captionTracks":';
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) throw new Error("No captions found for this video");

  const arrayStart = html.indexOf("[", markerIdx);
  let depth = 0;
  let arrayEnd = -1;
  let inString = false;
  let escape = false;
  for (let i = arrayStart; i < html.length; i++) {
    const ch = html[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) { arrayEnd = i + 1; break; }
    }
  }
  if (arrayEnd === -1) throw new Error("Could not parse caption tracks from page");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const captionTracks: any[] = JSON.parse(html.slice(arrayStart, arrayEnd));
  if (!captionTracks?.length) throw new Error("No captions available");

  // Prefer English auto-generated → English manual → first available
  const track =
    captionTracks.find((t) => t.languageCode === "en" && t.kind === "asr") ||
    captionTracks.find((t) => t.languageCode === "en") ||
    captionTracks.find((t) => t.languageCode?.startsWith("en")) ||
    captionTracks[0];

  if (!track?.baseUrl) throw new Error("No valid caption track found");

  // Fetch transcript as json3 (timestamped segments)
  const transcriptRes = await fetch(`${track.baseUrl}&fmt=json3`);
  if (!transcriptRes.ok) throw new Error(`Transcript fetch returned ${transcriptRes.status}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await transcriptRes.json();

  const items: { text: string; duration: number }[] = [];
  for (const event of data.events || []) {
    if (!event.segs) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = event.segs.map((s: any) => s.utf8 || "").join("").trim();
    if (text) items.push({ text, duration: event.dDurationMs || 0 });
  }

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

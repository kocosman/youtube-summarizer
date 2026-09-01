import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { jwtVerify } from "jose";

// Rich text objects are capped at 2000 chars each — chunk defensively.
const RICH_TEXT_LIMIT = 2000;

function toRichText(text: string) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += RICH_TEXT_LIMIT) {
    chunks.push(text.slice(i, i + RICH_TEXT_LIMIT));
  }
  return chunks.map((content) => ({ type: "text" as const, text: { content } }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotionBlock = any;

// Convert the "## Heading" + bullet/paragraph summary markdown into Notion
// blocks: each heading becomes a heading_2, bullet lines become
// bulleted_list_item, everything else is grouped into paragraphs.
function summaryToBlocks(summary: string): NotionBlock[] {
  const blocks: NotionBlock[] = [];
  let paragraphLines: string[] = [];

  function flushParagraph() {
    if (paragraphLines.length === 0) return;
    blocks.push({
      type: "paragraph",
      paragraph: { rich_text: toRichText(paragraphLines.join(" ").trim()) },
    });
    paragraphLines = [];
  }

  for (const line of summary.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushParagraph();
      blocks.push({
        type: "heading_2",
        heading_2: { rich_text: toRichText(trimmed.slice(3).trim()) },
      });
      continue;
    }
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      flushParagraph();
      blocks.push({
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: toRichText(trimmed.slice(2).trim()) },
      });
      continue;
    }
    paragraphLines.push(trimmed);
  }
  flushParagraph();

  return blocks;
}

async function isAuthenticated(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("auth_token")?.value;
  if (!token) return false;
  try {
    const secret = new TextEncoder().encode(process.env.APP_PASSWORD ?? "");
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // --- Auth check ---
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Config check ---
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!apiKey || !databaseId) {
    return NextResponse.json(
      { error: "Server misconfiguration: Notion integration not set up." },
      { status: 500 }
    );
  }

  // --- Parse body ---
  let url: string;
  let videoId: string;
  let title: string;
  let summary: string;
  let tags: string[];
  let wordCount: number;
  try {
    const body = await req.json();
    url = body.url;
    videoId = body.videoId;
    title = body.title;
    summary = body.summary;
    tags = Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === "string") : [];
    wordCount = typeof body.transcriptWordCount === "number" ? body.transcriptWordCount : 0;
    if (!url || !videoId || !title || !summary) throw new Error("missing fields");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // --- Create the Notion page ---
  const notion = new Client({ auth: apiKey });
  try {
    const page = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Name: { title: [{ text: { content: title } }] },
        URL: { url },
        Tags: { multi_select: tags.map((name) => ({ name })) },
        "Word Count": { number: wordCount },
        "Video ID": { rich_text: [{ text: { content: videoId } }] },
      },
      children: summaryToBlocks(summary),
    });

    const pageUrl = "url" in page ? page.url : undefined;
    return NextResponse.json({ ok: true, pageUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Notion API error: " + msg }, { status: 502 });
  }
}

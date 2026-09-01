# YouTube Summarizer

## What this is
A personal web app (for my use only) that takes a YouTube URL,
fetches the transcript, and returns an AI-generated summary using
the Anthropic Claude API. Built with Next.js, deployed on Vercel.

## Stack
- Next.js (App Router)
- Anthropic Claude API (claude-sonnet-4-5 or latest)
- Supadata API for transcript fetching
- Notion API (@notionhq/client) for saving summaries
- Deployed on Vercel
- No database of our own — saved summaries live in Notion; on-screen state is ephemeral

## Project structure
app/
  page.tsx              # UI — URL input, submit button, summary display, Save to Notion button
  api/
    summarize/
      route.ts          # Backend — transcript fetch + Claude API call + tag extraction
    notion/
      save/
        route.ts        # Backend — creates a page in the Notion database from a summary
prompts/
  summarize.md          # The summarization prompt (editable without code changes)
.env.local              # API keys — never commit this
vercel.json             # Vercel config

## Environment variables
ANTHROPIC_API_KEY       # Claude API key
APP_PASSWORD            # Simple auth password — server-side only, never exposed to the browser
SUPADATA_API_KEY        # Transcript fetching
NOTION_API_KEY          # Notion internal integration secret (from notion.so/my-integrations)
NOTION_DATABASE_ID      # ID of the "YouTube Summaries" database the integration must be shared with

## Saving to Notion
The summarize prompt asks Claude for a fifth "## Tags" section (comma-separated,
Title Case). `app/api/summarize/route.ts` strips that section out of the summary
before returning it and returns `tags: string[]` separately, along with `videoId`
and a best-effort `title` (fetched from YouTube's oEmbed endpoint, no API key
needed).

The "Save to Notion" button (shown once a summary is ready) posts to
`/api/notion/save`, which creates a page in the `NOTION_DATABASE_ID` database:
- Name (title) — video title
- URL
- Tags (multi-select) — auto-creates new options as new tags show up
- Word Count
- Video ID
- Saved (created-time, automatic)

The summary body is converted to Notion blocks (headings/paragraphs/bullets)
and written as the page content.

Setup (one-time, done by the human, not Claude):
1. Create an internal integration at notion.so/my-integrations, copy its secret
   into `NOTION_API_KEY`.
2. Share the "YouTube Summaries" database (under AI Journey) with that
   integration.
3. Set `NOTION_DATABASE_ID` to the database's ID (from its URL).
4. Add both vars to Vercel project settings for production.

## Authentication
Cookie-based auth persists across sessions (7-day httpOnly cookie):

1. On page load, `GET /api/auth/check` verifies the `auth_token` cookie.
   - Valid → show the main app directly.
   - Missing/invalid → show the password screen.
2. User enters the password; `POST /api/auth` checks it against `APP_PASSWORD`
   and, if correct, signs a JWT (HS256, 7-day expiry) using `APP_PASSWORD` as
   the secret (via `jose`), then sets an `auth_token` cookie:
   - `httpOnly: true` — not readable by JavaScript
   - `secure: true` in production — only sent over HTTPS
   - `sameSite: lax`
   - `maxAge: 7 days`
3. All subsequent API calls rely on the browser sending the cookie automatically.
4. `DELETE /api/auth` clears the cookie (logout button in the UI).
5. If `/api/summarize` returns 401 mid-session (expired cookie), the UI drops
   back to the password screen.

API routes:
  app/api/auth/route.ts          POST = login, DELETE = logout
  app/api/auth/check/route.ts    GET = verify cookie

Nothing auth-related goes in the frontend bundle — no NEXT_PUBLIC_* vars.

## Summarization prompt
The prompt lives in prompts/summarize.md — load this file at
runtime in the API route. Do NOT hardcode the prompt in route.ts.
This lets me tune the prompt without touching code.

## UI/UX
- Single page, dark theme, centered layout, max-width 640px
- Full-width URL input field
- Submit button below it
- Loading state with subtle animation while processing
- Summary renders as formatted markdown below
- Error states shown clearly in red
- Mobile friendly
- Clean and minimal — no nav, no header, no clutter

## Key behaviors
- Validate the URL is a valid YouTube link before calling the API
- Handle missing transcripts gracefully (private videos, no captions)
- Show character/word count of transcript before summarizing (useful for debugging)
- Max video length warning for videos over 2 hours

## What to build first (in order)
1. Scaffold the Next.js project
2. Create the folder structure above
3. Build the UI in page.tsx
4. Write the API route with password check
5. Hook up youtube-transcript
6. Hook up Anthropic API
7. Wire up prompts/summarize.md
8. Create .gitignore (must exclude .env.local and node_modules)
9. Initialize git repo

## Coding preferences
- TypeScript
- Clean, readable code with comments
- Error handling at every async step
- No unnecessary dependencies

# YouTube Summarizer

## What this is
A personal web app (for my use only) that takes a YouTube URL,
fetches the transcript, and returns an AI-generated summary using
the Anthropic Claude API. Built with Next.js, deployed on Vercel.

## Stack
- Next.js (App Router)
- Anthropic Claude API (claude-sonnet-4-5 or latest)
- youtube-transcript npm package
- Deployed on Vercel
- No database (yet) — summaries display on screen only

## Project structure
app/
  page.tsx              # UI — URL input, submit button, summary display
  api/
    summarize/
      route.ts          # Backend — transcript fetch + Claude API call
prompts/
  summarize.md          # The summarization prompt (editable without code changes)
.env.local              # API keys — never commit this
vercel.json             # Vercel config

## Environment variables
ANTHROPIC_API_KEY       # Claude API key
APP_PASSWORD            # Simple auth password — server-side only, never exposed to the browser

## Authentication
On load, the UI shows a password input. The user types the password at runtime;
it is stored in React state and sent as the x-app-password header with every
API call. The API route checks it against APP_PASSWORD (server env var) and
rejects requests that don't match.

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

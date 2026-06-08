# PromptLab

A full-stack web application for testing, versioning, and benchmarking AI prompts across multiple models — supporting concept generation (text/JSON) and image generation workflows.

## Features

- **Prompt Library** — Versioned prompts with a CodeMirror editor, `{{variable}}` highlighting, and side-by-side diff viewer
- **Concept Generation** — Run prompts across multiple text models (Anthropic, OpenAI, custom) and compare JSON outputs
- **Image Generation** — Feed concept JSON into image models (DALL-E 3, gpt-image-1) with optional reference images
- **Model Management** — Add any provider with API key, model string, and extra config
- **Results Dashboard** — Charts (generation time, cost, quality ratings), filterable runs table, CSV export

---

## Local Development Setup

### 1. Clone and install

```bash
git clone <your-repo>
cd promptlab
npm install
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. In the SQL Editor, run the contents of `supabase/migrations/001_initial.sql`
3. The migration creates all tables, RLS policies, and a `generated-images` Storage bucket

### 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `ANTHROPIC_API_KEY` | Anthropic API key (default for Claude models) |
| `OPENAI_API_KEY` | OpenAI API key (default for GPT/DALL-E models) |

### 4. Run the dev server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login`.

---

## How to Add a New AI Model

1. Navigate to **Models** in the sidebar and click **Add Model**
2. Fill in Provider, Model String, Type (`text` or `image`), and API Key
3. For custom/self-hosted endpoints, set **Base URL** and use provider `custom`
4. Extra Config accepts JSON for params like `{"temperature": 0.7, "max_tokens": 2048}`

---

## Workflows

### Part 1 — Concept Generation

```
Prompt params filled → variables resolved → JSON instruction appended
→ Model API called → JSON extracted from response
→ concept_runs record updated → Realtime UI update
```

### Part 2 — Image Generation

```
Concept JSON pasted (or imported from Part 1 run)
→ {{concept_json}} injected into image prompt
→ Image model called → images uploaded to Supabase Storage
→ image_runs record updated → Realtime UI update
```

---

## Running Tests

```bash
npm run test          # Unit tests (25 tests)
npm run test:watch    # Watch mode
npm run test:e2e      # E2E tests (requires running dev server)
```

---

## Deploying to Vercel

```bash
npm i -g vercel
vercel env add SUPABASE_SERVICE_ROLE_KEY   # and other secrets
vercel --prod
```

The `vercel.json` configures 120s timeouts on API routes for long-running model calls.

---

## Tech Stack

Next.js 14 · TypeScript · Tailwind CSS · shadcn/ui · Supabase · @anthropic-ai/sdk · openai · CodeMirror 6 · Recharts · Vitest · Playwright

---

## Original Next.js README

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

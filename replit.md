# Lexi AI Chat Application

## Overview

Lexi is a mobile-first AI companion chat application featuring an intimate, premium chat interface inspired by Telegram Premium, Replika, and Locket Widget. Users land on an onboarding page, enter their name, and are taken to a persistent chat interface where they converse with an AI persona named "Lexi" (or "Ninna" in some localized flows). The app stores conversation history in a PostgreSQL database and uses OpenAI for AI responses.

Key features:
- Landing/onboarding page where users create a profile
- Persistent chat interface with real-time AI responses
- Conversation and message history stored in PostgreSQL
- Premium glassmorphic dark UI with pink/purple neon accents
- Voice chat infrastructure (Replit integration utilities included)
- Image generation endpoint (Replit integration utility)
- "Unlock Content" modal that redirects to an external platform

---

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Frontend (React + Vite)

- **Framework**: React 18 with TypeScript, bundled via Vite
- **Routing**: `wouter` (lightweight client-side router). Two main routes: `/` (Landing) and `/chat` (Chat interface)
- **State/Data Fetching**: TanStack React Query for server state; `useState`/`useRef` for local UI state
- **Styling**: Tailwind CSS (dark theme, CSS custom properties for color palette), shadcn/ui components (New York style), Framer Motion for animations
- **Font**: Outfit (display) + Inter (body) loaded via Google Fonts
- **Path Aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`
- **User persistence**: User ID stored in `localStorage` under `ninna_user` key — no session cookies or JWT on the client
- **Custom hooks**:
  - `use-chat.ts`: Manages conversation init, message history, sending messages, and typing state
  - `use-user.ts`: Handles user creation via API and localStorage persistence
  - `use-mobile.tsx`: Detects mobile breakpoint (768px)
  - `use-toast.ts`: Toast notification system

### Backend (Express + Node.js)

- **Framework**: Express 5 running on Node.js with TypeScript (executed via `tsx` in dev, compiled with esbuild for prod)
- **Entry point**: `server/index.ts` → registers routes via `server/routes.ts`
- **API routes**: Defined in `server/routes.ts` and Replit integration modules
  - `POST /api/users` — create user
  - `GET /api/users/:id` — get user
  - `GET /api/conversations?userId=` — list conversations for a user
  - `POST /api/conversations` — create conversation
  - `GET /api/conversations/:id` — get conversation with messages
  - `POST /api/conversations/:id/messages` — send message and get AI response (streaming SSE)
  - `DELETE /api/conversations/:id` — delete conversation
  - Image generation and voice chat routes via Replit integration modules
- **AI integration**: OpenAI SDK pointed at Replit's AI proxy (`AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY` env vars)
- **Storage layer**: `server/storage.ts` provides a `DatabaseStorage` class implementing `IStorage`; `server/replit_integrations/chat/storage.ts` provides `chatStorage` for the integration routes — both use the same DB

### Shared Layer (`shared/`)

- **Schema** (`shared/schema.ts`): Single source of truth for DB tables and TypeScript types using Drizzle ORM + drizzle-zod
  - `users`: id, name, isPremium, messageCount, createdAt
  - `conversations`: id, userId (FK → users), title, createdAt
  - `messages`: id, conversationId (FK → conversations), role, content, createdAt
- **Routes** (`shared/routes.ts`): Typed API contract shared between frontend and backend using Zod schemas (currently covers `/api/users`)
- **Note**: `shared/models/chat.ts` is a duplicate/legacy definition of conversations and messages — the canonical definitions are in `shared/schema.ts`

### Database

- **PostgreSQL** via `drizzle-orm/node-postgres` (pg Pool)
- **ORM**: Drizzle ORM with Drizzle Kit for migrations (`drizzle-kit push` to sync schema)
- **Config**: `drizzle.config.ts` points at `./shared/schema.ts`, outputs migrations to `./migrations/`
- **Connection**: `DATABASE_URL` environment variable required

### Build System

- **Dev**: `tsx server/index.ts` with Vite middleware for HMR
- **Production build**: `script/build.ts` runs Vite build (client → `dist/public/`) then esbuild (server → `dist/index.cjs`)
- **Server bundling**: A curated allowlist of server dependencies is bundled into the CJS output to reduce cold-start syscalls; all others are externalized

### Replit Integration Modules

Located in `server/replit_integrations/` and `client/replit_integrations/`:
- **Chat** (`replit_integrations/chat/`): Registers conversation/message routes with AI completion, reuses main DB schema
- **Audio** (`replit_integrations/audio/`): Voice recording (client), PCM16 playback via AudioWorklet (client), WebM→WAV conversion via ffmpeg, speech-to-text and TTS via OpenAI (server)
- **Image** (`replit_integrations/image/`): Image generation via OpenAI `gpt-image-1`
- **Batch** (`replit_integrations/batch/`): Generic rate-limited + retried batch processing utility for LLM workloads

---

## External Dependencies

| Dependency | Purpose |
|---|---|
| **OpenAI API** (via Replit AI proxy) | AI chat completions, image generation, speech-to-text, TTS. Configured via `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` |
| **PostgreSQL** | Primary data store. Connection string via `DATABASE_URL` |
| **Google Fonts** | Outfit and Inter typefaces loaded in `index.html` |
| **Radix UI** | Headless accessible UI primitives (accordion, dialog, dropdown, etc.) |
| **shadcn/ui** | Pre-built component layer on top of Radix UI (New York style variant) |
| **Framer Motion** | Chat bubble entry animations, page transitions |
| **TanStack React Query** | Server state management and caching |
| **Drizzle ORM + drizzle-kit** | Type-safe database access and schema migration |
| **wouter** | Client-side routing |
| **Zod** | Runtime validation for API inputs and shared schemas |
| **ffmpeg** (system binary) | WebM-to-WAV audio conversion in voice chat pipeline (available on Replit by default) |
| **connect-pg-simple / express-session** | Session management infrastructure (installed but session auth not fully wired in current routes) |
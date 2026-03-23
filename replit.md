# Ninna Ray AI Agency

## Overview

Ninna Ray is an AI-powered OnlyFans agency management platform. It provides a Czech-language AI chat companion (Ninna_Ray🍒) that chats with fans using GPT-4o with SSE streaming and human-like "seen/typing" delays. The app includes a full 3-role agency system: Customer (public chat), Agent (manual reply/takeover), Owner (full admin + AI Manager).

## User Preferences

Preferred communication style: Simple, everyday language. Czech language UI.

## Routes & Roles

- `/` — Landing page (customer entry)
- `/chat` — Customer chat with Ninna AI
- `/agent` — Agent dashboard (password: `agent2025`) — view conversations, takeover AI, send manual replies
- `/admin` — Owner dashboard (password: `owner2025`) — stats, users, conversations viewer
- `/manager` — AI Manager (owner login) — autonomous customer analysis, engagement scoring, content recommendations

## System Architecture

### Frontend
- **Framework**: React 18 + TypeScript
- **Routing**: Wouter
- **State**: TanStack React Query + React hooks
- **Styling**: Tailwind CSS v3, Framer Motion animations
- **UI**: Shadcn/ui (Radix primitives)
- **Build**: Vite → `dist/public/`

### Backend
- **Framework**: Express + TypeScript (tsx runtime)
- **AI**: OpenAI GPT-4o via Replit AI Integrations (streaming SSE)
- **Auth**: express-session with role-based access (Customer/Agent/Owner)
- **Middleware**: `requireAgent` (agent+owner), `requireOwner` (owner only)

### Database
- **PostgreSQL** via Drizzle ORM
- **Tables**: `users` (with `aiProfile` jsonb, `aiProfileUpdatedAt`), `conversations` (with `manualMode`, `assignedAgent`), `messages`, `content_items` (vault), `manager_actions` (action queue), `manager_log` (engine activity log)
- **Migrations**: `npx drizzle-kit push`

### AI Manager System — Fully Autonomous Engine
- **Fully autonomous** — runs on 10-minute interval, analyzes ALL users, generates actions AND EXECUTES THEM automatically
- **Auto-execution**: Engine sends messages directly to customer conversations — no manual intervention needed
  - `timing: "teď"` → sent immediately after analysis
  - `timing: "za 1h"` / `"za 3h"` → queued in delayed queue, processed every 30s
  - `timing: "dnes večer"` → 4h delay; `"zítra"` → 12h delay
- **Pause/Resume**: Owner can pause engine via `POST /api/manager/engine-pause` — stops all auto-sending
- **Backlog sweep**: On engine start, processes all pending actions from previous runs
- **Engine file**: `server/manager-engine.ts` — starts on server boot, runs `runFullScan()` every 10 min
- **Auto-reanalyze**: After each chat message, triggers re-analysis if profile > 5 min old
- **Adaptive personalization** — builds persistent individual profiles per customer:
  - `communicationPatterns`: msg length, response speed, emoji usage, tone, peak hours
  - `emotionalTriggers`: what makes them respond, buy, or disengage
  - `whatWorks` / `whatFails`: learned from interaction history, preserved across analyses
  - `relationshipStage`: nový/budování/stabilní/monetizace/reaktivace
  - `nextMilestone`: what's the next goal for this relationship
- **Previous profile as memory**: Each analysis receives the previous profile so AI builds on it, not from scratch
- **Strictly actionable output**: Every analytical block (personality, interests, warnings) must convert to concrete messages with timing, purpose, and photo assignments
- **No generic responses**: AI must personalize based on conversation history, style, and emotional triggers
- **Action queue persisted**: Actions stored in `manager_actions` DB table with status tracking (pending/done/dismissed/failed)
- **Auto-sent marker**: Actions executed by engine have `result: "auto-sent"` in DB
- Strategy logic: high engagement → SELL, medium → BUILD, low → HOOK
- **Owner Dashboard**:
  - Engine status with ⏸ Pause / ▶ Resume button
  - Auto-sent message log with photos, badges, timestamps
  - Pending actions (if engine was paused) with manual "Odesláno" / "Zahodit" buttons
  - Vault photo thumbnails inline in action cards
  - Clickable status boxes navigate to filtered customer list
  - Strategy/buying potential/relationship stage breakdowns

### Content Vault
- Upload photos/videos/audio content with tags and categories
- Content stored in `uploads/` directory, metadata in `content_items` table
- AI automatically categorizes photos (teasing/cute/explicit/casual) and assigns to scenarios
- Track usage count per content item
- Vault photos displayed inline in action cards when engine recommends them

### Key API Endpoints
- `POST /api/manager/analyze/:userId` — trigger manual analysis (uses engine)
- `GET /api/manager/engine-status` — engine running state, paused state, last/next scan, recent logs, delayed count
- `POST /api/manager/engine-pause` — pause/resume engine (`{ paused: true/false }`)
- `GET /api/manager/actions` — list pending/done actions
- `PATCH /api/manager/actions/:id` — update action status
- `GET /api/manager/logs` — engine activity log
- `GET /api/manager/overview`, `POST /api/manager/analyze-all`, `POST /api/manager/trends`, `POST /api/manager/broadcast`

### Deployment
- **Target**: Autoscale
- **Build**: `npx vite build`
- **Run**: `NODE_ENV=production npx vite build && NODE_ENV=production tsx server/index.ts`
- **Production**: Static files served from `dist/public/`, SPA catch-all routing, secure cookies with trust proxy

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string
- `AI_INTEGRATIONS_OPENAI_API_KEY` — OpenAI API key (via Replit integration)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — OpenAI base URL (via Replit integration)
- `SESSION_SECRET` — Express session secret
- `AGENT_PASSWORD` — Password for agent login (default: `agent2025`)
- `OWNER_PASSWORD` — Password for owner login (default: `owner2025`)

### Stripe Payment Integration
- **Status**: Infrastructure ready, waiting for Stripe account connection
- **Stripe not yet connected**: App works fine without it — shows "Platby se připravují" to customers
- **When connected**: Run `npx tsx scripts/seed-products.ts` to create products, then payments activate automatically
- **Webhook**: Route registered BEFORE `express.json()` in `server/index.ts`
- **Checkout**: Auto-detects subscription vs one-time payment mode from price type
- **Products planned**: VIP subscription (monthly/yearly CZK), PPV content, Custom content, Tips
- **Customer flow**: Chat → VIP crown button → /payment → Stripe Checkout → /payment/success
- **Owner view**: Manager dashboard → Platby tab — shows Stripe status, products, paying customers
- **Files**: `server/stripeClient.ts`, `server/webhookHandlers.ts`, `server/stripeService.ts`, `scripts/seed-products.ts`
- **Pages**: `/payment`, `/payment/success`, `/payment/cancel`

## Key Files

- `server/routes.ts` — All API routes (auth, chat, agent, admin, manager, stripe)
- `server/manager-engine.ts` — Autonomous AI manager engine (scan, analyze, auto-execute, delayed queue)
- `server/index.ts` — Express setup, session config, Stripe webhook + init, engine startup
- `server/storage.ts` — Database CRUD operations (incl. manager_actions, manager_log, stripe customer ID)
- `server/stripeClient.ts` — Stripe credentials from Replit connections API
- `server/stripeService.ts` — Stripe API operations (checkout, portal, products query)
- `server/webhookHandlers.ts` — Stripe webhook processing via stripe-replit-sync
- `server/static.ts` — Production static file serving
- `shared/schema.ts` — Drizzle schema + Zod types (users with stripeCustomerId, managerActions, managerLog)
- `client/src/pages/ManagerDashboard.tsx` — AI Manager dashboard (overview, customers, vault, trends, broadcast, payments)
- `client/src/pages/Payment.tsx` — Customer payment page with product cards
- `scripts/seed-products.ts` — Creates products in Stripe (run after connecting)

## Critical Architecture Notes

- `normalizeName()` = trim + lowercase + NFD + strip diacritics — "Žerik" groups with "Zerik"
- Sidebar badge uses `STATUS_CONFIG[bestStatus].label` (short: "🔥 Horký") NOT `aiProfile.statusLabel`
- Backend vault upload: field `files` (not `file`), uses `upload.array("files", 50)`
- Analysis: last 200 messages (slice(-200)), includes vault photo list + previous profile as memory context
- Old profiles (without `actionQueue`) fall back to showing `suggestedMessages`
- Auth: owner login `POST /api/auth/login` with `{ password: "owner2025", role: "owner", username: "Manager" }`
- `package.json` uses `"type": "module"` — CommonJS scripts need `.cjs` extension
- Engine auto-execution: `executeAction()` calls `storage.createMessage()` directly into conversation
- Delayed queue: in-memory array, processed every 30s, checks if action still "pending" before executing
- Engine pause: `setEnginePaused(true)` stops all auto-sending, backlog processing, and delayed queue

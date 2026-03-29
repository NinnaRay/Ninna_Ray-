# Ninna Ray AI Agency

## Overview

Ninna Ray is an AI-powered digital agency management platform with in-app Stripe monetization. It provides a Czech-language AI chat companion (Ninna_Ray🍒) that chats with fans using GPT-4o with SSE streaming and human-like "seen/typing" delays. The app includes a full 3-role agency system: Customer (public chat), Agent (manual reply/takeover), Owner (full admin + AI Manager). All monetization happens in-app via Stripe — no external platform redirects.

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

### AI Manager System — Fully Autonomous Self-Running Monetization Engine
- **Fully autonomous** — runs on 10-minute interval, analyzes ALL users, generates actions AND EXECUTES THEM automatically
- **Self-managing**: Engine cleans up after itself — detects test accounts, duplicate users, and removes them automatically
- **7 autonomous features**: autoCleanup, selfLearning, autoMessaging, duplicateDetection, antiSpam, revenueOptimization, perUserMemory
- **Self-learning** (enhanced):
  - Tracks response rates per purpose type (build/sell/hook) and timing
  - Identifies best-performing message types and worst-performing approaches
  - Computes average response time per user
  - Feeds learning data into analysis prompt so AI adapts strategies based on real data
  - 72h analysis window for statistical significance
- **Anti-spam protection**:
  - Max 3 messages per hour per user, max 8 per day
  - Rate-limited actions are deferred (rescheduled +60min), not dropped
  - Double-send prevention: if last message was assistant and < 10 min ago, defers to +15 min
  - `onNewMessage()` triggers AFTER assistant reply is saved (prevents race condition duplicates)
- **Revenue optimization loop**:
  - Per-user purchase history injected into analysis (total spent, avg payment, last purchase, price range)
  - Dynamic pricing: AI suggests prices based on spending patterns (low first purchase → upsell gradually)
  - A/B sell style testing: alternates between direct/indirect/tease approaches per user
  - Pressure calibration: auto-reduces sell pressure for inactive/unresponsive users
  - New profile fields: `priceSensitivity`, `sellStyle`, `suggestedPrice`
- **Per-user memory** (enhanced):
  - All profile fields preserved across analyses (whatWorks, whatFails, emotionalTriggers, priceSensitivity, sellStyle)
  - Purchase history and pricing context available in both manager analysis AND real-time chat prompt
  - Revenue memory fields (priceSensitivity, sellStyle, suggestedPrice) injected into chat system prompt
- **Human-like chat behavior** (enhanced):
  - Variable delays based on message length and time of day (night = slower responses)
  - Engagement-aware monetization: only offers content to engaged users (>30 char avg, >10 msgs, or engagement >= 50%)
  - Prompt instructs occasional typos, incomplete thoughts, varied sentence structure
  - Context-aware responses (no flirt when user talks about their day, no small talk when user flirts)
- **Auto-cleanup**: Runs on resume + every 60 min — deletes test accounts and empty duplicates
  - Groups by `normalizeName()` — if "Žerik" has 5 duplicates with 0 messages, deletes them, keeps the one with messages
- **Auto-execution**: Engine sends messages directly to customer conversations — no manual intervention needed
  - `timing: "teď"` → sent immediately after analysis
  - `timing: "za 1h"` / `"za 3h"` → queued in delayed queue, processed every 30s
  - `timing: "dnes večer"` → 4h delay; `"zítra"` → 12h delay
- **Pause/Resume**: Owner can pause engine via `POST /api/manager/engine-pause` — stops all auto-sending
- **On resume sequence**: autoCleanup(1s) → backlog(3s) → selfLearn(4s) → fullScan(6s)
- **Backlog sweep**: On engine start, processes all pending actions from previous runs
- **Engine file**: `server/manager-engine.ts` — starts on server boot, runs `runFullScan()` every 10 min
- **Auto-reanalyze**: After each chat message (AFTER assistant response saved), triggers re-analysis if profile > 5 min old
- **Delete user API**: `DELETE /api/manager/users/:userId` — cascade deletes conversations, messages, actions
- **Adaptive personalization** — builds persistent individual profiles per customer:
  - `communicationPatterns`: msg length, response speed, emoji usage, tone, peak hours
  - `emotionalTriggers`: what makes them respond, buy, or disengage
  - `whatWorks` / `whatFails`: learned from interaction history, preserved across analyses
  - `relationshipStage`: nový/budování/stabilní/monetizace/reaktivace
  - `nextMilestone`: what's the next goal for this relationship
  - `priceSensitivity`: nízká/střední/vysoká — how price-sensitive the user is
  - `sellStyle`: direct/indirect/tease — which approach works best
  - `suggestedPrice`: AI-recommended price in CZK for next content offer
- **Previous profile as memory**: Each analysis receives the previous profile so AI builds on it, not from scratch
- **Strictly actionable output**: Every analytical block (personality, interests, warnings) must convert to concrete messages with timing, purpose, and photo assignments
- **No generic responses**: AI must personalize based on conversation history, style, and emotional triggers
- **Action queue persisted**: Actions stored in `manager_actions` DB table with status tracking (pending/done/dismissed/failed)
- **Auto-sent marker**: Actions executed by engine have `result: "auto-sent"` in DB
- Strategy logic: high engagement → SELL, medium → BUILD, low → HOOK
- **Owner Dashboard** (enhanced):
  - Engine status with ⏸ Pause / ▶ Resume button
  - 7 autonomous feature indicators (green = active, grey = paused)
  - Self-Learning Insights panel: response rate, avg response time, messages sent, per-purpose performance badges
  - Revenue profil per customer: cenová citlivost, prodejní styl, doporučená cena
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

### Stripe Payment Integration (In-App Only)
- **Status**: Infrastructure ready, waiting for Stripe account connection
- **Stripe not yet connected**: App works fine without it — shows "Platby se připravují" to customers
- **When connected**: Run `npx tsx scripts/seed-products.ts` to create products, then payments activate automatically
- **Webhook**: Route registered BEFORE `express.json()` in `server/index.ts`, handles `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`
- **In-chat purchases**: Content offered via tease→interest→offer flow, Stripe checkout for individual content items
- **Content checkout**: `POST /api/stripe/content-checkout` creates dynamic price for content items in CZK
- **Payment tracking**: `payments` table tracks all in-app purchases with status (pending/completed/failed)
- **Admin metrics**: Revenue, conversions, conversion rate, recent payments in Platby tab
- **No external redirects**: All monetization happens within the app — no OnlyFans/Fansly links
- **Customer flow**: Chat → AI tease → content offer → Stripe Checkout → unlock content
- **Owner view**: Manager dashboard → Platby tab — Stripe status (OK/ERROR), revenue, conversions, payment history
- **Files**: `server/stripeClient.ts`, `server/webhookHandlers.ts`, `server/stripeService.ts`, `scripts/seed-products.ts`
- **Pages**: `/payment`, `/payment/success`, `/payment/cancel`

### AI Behavior Strategy
- **Primary goal**: Build emotional connection, personalize responses, extend conversations
- **No immediate sales**: Agent never pushes purchases immediately — relationship first
- **Engagement detection**: AI detects user interest via message length, emotional responses, flirting
- **Monetization flow**: tease → interest → offer → Stripe payment → unlock content
- **Engaged users**: Offered exclusive content directly in chat
- **Disengaged users**: Continue relationship building without sales pressure

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

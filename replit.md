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
- **Tables**: `users` (with `aiProfile` jsonb, `aiProfileUpdatedAt`), `conversations` (with `manualMode`, `assignedAgent`), `messages`, `content_items` (vault)
- **Migrations**: `npx drizzle-kit push`

### AI Manager System
- **Autonomous AI agent** — not just analysis but ACTIONABLE INSTRUCTIONS ready to execute
- GPT-4o analyzes last 200 messages + vault photos + OnlyFans trend knowledge
- Generates action-based profiles with:
  - Status (hot/warm/cold/new), engagement score, strategy (build/sell/hook)
  - **mainDriver**: single directive that drives the whole conversation
  - **actionQueue**: ready-to-send messages with timing, purpose (build/sell/hook), and vault photo assignments
  - **styleNotes**: communication style adapted from warnings (not displayed as warnings)
  - **trendInsights**: relevant trends for this specific customer
- Vault photos are passed to analysis prompt — AI categorizes them and assigns to specific messages
- Strategy logic: high engagement → SELL (monetize), medium → BUILD (relationship), low → HOOK (re-engage)
- **User Grouping**: Users grouped by normalized name (diacritics stripped, case-insensitive). Sidebar shows engagement %, strategy badge, main driver preview.
- **Conversation Viewer**: Full chat history below profile in one scrollable view
- **Search**: Filter users by name
- **Trend Scanner**: Agency-wide content strategy
- **Broadcast**: Send to all conversations
- Selected user persists across tab switches (state lifted to parent)
- Endpoints: `POST /api/manager/analyze/:userId`, `GET /api/manager/overview`, `POST /api/manager/analyze-all`, `POST /api/manager/trends`, `POST /api/manager/broadcast`, `GET /api/manager/users/:userId/conversations`, `POST /api/manager/users/bulk-conversations`

### Content Vault
- Upload photos/videos/audio content with tags and categories
- Content stored in `uploads/` directory, metadata in `content_items` table
- Send content directly to customer conversations
- Track usage count per content item
- Endpoints: `GET /api/vault/items`, `POST /api/vault/upload`, `DELETE /api/vault/items/:id`, `POST /api/vault/items/:id/send/:conversationId`

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

## Future: Payments (Stripe)

Stripe integration was offered but not yet set up. User dismissed the Replit Stripe connector. When ready, either:
1. Re-propose the Replit Stripe integration connector
2. Or ask user for Stripe API keys to store as secrets

Planned features: PPV content, tips, content store, revenue dashboard.

## Key Files

- `server/routes.ts` — All API routes (auth, chat, agent, admin, manager)
- `server/index.ts` — Express setup, session config, production/dev mode
- `server/storage.ts` — Database CRUD operations
- `server/static.ts` — Production static file serving
- `shared/schema.ts` — Drizzle schema + Zod types
- `client/src/pages/Landing.tsx` — Entry page
- `client/src/pages/Chat.tsx` — Customer chat UI
- `client/src/pages/AgentDashboard.tsx` — Agent takeover interface
- `client/src/pages/AdminDashboard.tsx` — Owner stats/users/conversations
- `client/src/pages/ManagerDashboard.tsx` — AI Manager autonomous analysis

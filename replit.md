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
- **Tables**: `users` (with `aiProfile` jsonb, `aiProfileUpdatedAt`), `conversations` (with `manualMode`, `assignedAgent`), `messages`
- **Migrations**: `npx drizzle-kit push`

### AI Manager System
- GPT-4o analyzes customer conversation history
- Generates profiles: status (hot/warm/cold/new), engagement score, personality traits, interests, buying potential
- Provides actionable recommendations: next action, suggested messages, content ideas, warnings
- Batch analysis: analyze all users at once
- Endpoints: `POST /api/manager/analyze/:userId`, `GET /api/manager/overview`, `POST /api/manager/analyze-all`

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

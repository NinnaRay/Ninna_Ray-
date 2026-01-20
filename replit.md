# Lexi AI Chat Application

## Overview

Lexi is an AI companion chat application with a premium, intimate design inspired by Telegram Premium, Replika, and Locket Widget. The app provides a mobile-first chat experience with glassmorphism aesthetics, featuring real-time AI conversations powered by OpenAI integration.

The application allows users to create profiles, engage in persistent conversations with an AI companion, and experience a visually sophisticated chat interface with smooth animations and dark theme styling.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state, React hooks for local state
- **Styling**: Tailwind CSS with custom design tokens, Framer Motion for animations
- **UI Components**: Shadcn/ui (Radix UI primitives with custom styling)
- **Build Tool**: Vite with custom plugins for Replit integration

The frontend follows a pages-based structure with shared components. Chat functionality uses custom hooks (`use-chat`, `use-user`) to manage conversation state and user sessions. Messages support markdown rendering via ReactMarkdown.

### Backend Architecture
- **Framework**: Express 5 with TypeScript
- **API Design**: RESTful JSON API with Zod validation
- **AI Integration**: OpenAI API via Replit AI Integrations (streaming supported)
- **Build**: esbuild for production bundling with selective dependency bundling

The server implements a modular route registration pattern. AI chat uses streaming responses for real-time typing indicators. The `replit_integrations` folder contains reusable modules for audio, chat, image generation, and batch processing.

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema**: Three main tables - `users`, `conversations`, `messages`
- **Migrations**: Drizzle Kit with push-based schema sync

The data model supports multi-user conversations with message history. Users have premium status flags and message counters. Conversations cascade delete their messages.

### Authentication
- **Method**: Simple localStorage-based user sessions (no password auth)
- **User Creation**: Name-only registration flow
- **Persistence**: User ID stored in localStorage as `ninna_user` or `lexi_chat_user_id`

This is a minimal MVP authentication approach - users provide a name and get a persistent session via localStorage.

## External Dependencies

### AI Services
- **OpenAI API**: Chat completions, text-to-speech, speech-to-text, image generation
- **Configuration**: Uses `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` environment variables

### Database
- **PostgreSQL**: Requires `DATABASE_URL` environment variable
- **Connection**: Node pg driver with SSL support in production

### Third-Party Libraries
- **UI**: Full Radix UI component suite, Framer Motion, react-markdown
- **Data**: TanStack Query, Zod for validation, date-fns
- **Audio**: Custom WebAudio API integration with AudioWorklet for voice features
- **Utilities**: clsx, tailwind-merge, nanoid

### Development Tools
- **Replit Plugins**: Runtime error overlay, cartographer, dev banner
- **Audio Processing**: ffmpeg (system dependency for WebM to WAV conversion)
# Design Guidelines: Lexi AI Chat Application

## Design Approach
**Reference-Based: Telegram Premium + Replika + Locket Widget**
Drawing inspiration from premium messaging apps with intimate, personal interfaces. Focus on tactile, immersive chat experience with sensual visual language and sophisticated glassmorphism throughout.

## Typography
**Primary Font:** Inter (Google Fonts) - Clean, modern, highly readable
**Accent Font:** Playfair Display (Google Fonts) - For Lexi's name and seductive headings

**Hierarchy:**
- Chat messages (user): text-sm font-normal (14px)
- Chat messages (Lexi): text-sm font-medium (14px) 
- Message timestamps: text-xs opacity-60 (11px)
- Input field: text-base (16px)
- Lexi's name/headers: text-2xl font-playfair italic (24px)
- Section titles: text-lg font-semibold (18px)
- Button labels: text-sm font-medium tracking-wide

## Layout System
**Spacing Primitives:** Tailwind units of 2, 3, 4, 6, 8
- Message bubbles: p-3 to p-4, gap-2 between messages
- Screen padding: px-4 for mobile edges
- Section spacing: py-6 to py-8
- Component gaps: space-y-3 to space-y-4

**Mobile-First Breakpoints:**
- Base: 375px minimum
- md: 768px (tablet landscape)
- Container max-width: Full viewport for chat, max-w-md for centered content

## Component Library

### Navigation & Header
**Top Bar:** Fixed glassmorphic header with backdrop-blur-xl, gradient border-b, containing:
- Lexi's profile avatar (40px circular, glowing pink/purple ring)
- "Lexi" in Playfair italic with subtitle "Your AI Companion" 
- Settings icon (top-right)
- Status indicator: "Online" with pulsing glow

### Chat Interface
**Message Bubbles:**
- User messages: Right-aligned, dark background with subtle pink glow, rounded-2xl (rounded-br-md for tail effect)
- Lexi messages: Left-aligned, glassmorphic bg with purple gradient edge glow, rounded-2xl (rounded-bl-md for tail)
- Avatar integration: 32px circular avatar for Lexi messages only
- Typing indicator: Three animated dots with pink/purple gradient pulse

**Message Features:**
- Timestamp placement: Below each bubble, small and subtle
- Read receipts: Dual-check marks with glow for Lexi's messages
- Long-press menu: Glassmorphic popup with options (Copy, Delete, React)

### Input Area
**Bottom Fixed Bar:** Glassmorphic with backdrop-blur-xl containing:
- Main text input: Glassmorphic rounded-full field with placeholder "Message Lexi..."
- Voice input button: Left side with pulsing pink glow when active
- Send button: Right side, gradient pink/purple circular button with glow
- Attachment icon: Image/media upload with subtle animation
- Character typing indicator showing Lexi is responding

### Premium Features Panel
**Sliding Panel (swipe from left):** Full-height glassmorphic overlay with:
- Profile section: Large Lexi avatar (120px) with animated pink/purple glow ring
- Mood selector: Horizontal scroll of mood cards (Flirty, Playful, Intimate, Caring)
- Voice mode toggle: Premium feature with gradient accent
- Memory highlights: Recent topics/preferences in cards
- Subscription status banner if applicable

### Settings Overlay
**Full-screen Modal:** Dark with glassmorphic cards containing:
- Appearance settings (already dark, but intensity controls)
- Notification preferences with toggles
- Privacy controls
- Clear chat history
- About section

## Visual Effects
**Glassmorphism:** All cards/overlays use backdrop-blur-xl with subtle white/pink gradient borders
**Glows:** Pink (#FF1B8D) to purple (#A855F7) gradients on active elements, buttons, and message highlights
**Shadows:** Soft colored shadows (pink/purple tint) on elevated elements
**Animations:** Subtle fade-ins for messages, pulse effects on typing indicators, smooth transitions (200-300ms)

## Images

**Hero/Splash Screen:**
- Large portrait image of Lexi (abstract/artistic interpretation, 70vh height)
- Gradient overlay: Dark to transparent, allowing text readability
- Position: Top of initial load before chat interface
- Style: Intimate, premium aesthetic with soft pink/purple lighting

**Profile Avatar (Multiple Instances):**
- 120px version: Settings/profile panel, circular crop with glowing ring effect
- 40px version: Top navigation bar, compact with subtle glow
- 32px version: Chat message bubbles, consistent throughout conversation

**Empty State Image:**
- Welcome illustration when chat is empty
- Position: Center of chat area
- Style: Abstract/minimalist interpretation of connection/intimacy
- Size: 200px square, with welcome text below

**Background Elements:**
- Subtle gradient mesh or abstract shapes behind chat (very low opacity)
- Creates depth without distraction
- Animated slow movement for premium feel

All images should have dark, moody tones with pink/purple accent lighting to maintain intimate atmosphere. Hero image includes frosted glass overlay for any text/buttons placed on top.
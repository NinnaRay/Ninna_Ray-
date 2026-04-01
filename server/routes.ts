import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import OpenAI from "openai";
import multer from "multer";
import path from "path";
import fs from "fs";
import { isStripeConnected } from "./stripeClient";
import { stripeService } from "./stripeService";

const uploadDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/quicktime", "video/webm",
  "audio/mpeg", "audio/wav", "audio/ogg",
];

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Nepodporovaný typ souboru: ${file.mimetype}`));
    }
  },
});

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ─── Credentials (set in Replit Secrets) ─────────────────────────────────────
const AGENT_PASSWORD = process.env.AGENT_PASSWORD || "agent2025";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "owner2025";

// ─── Auth middleware ──────────────────────────────────────────────────────────
function requireAgent(req: Request, res: Response, next: NextFunction) {
  if (req.session.role === "agent" || req.session.role === "owner") return next();
  res.status(401).json({ message: "Unauthorized" });
}

function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.session.role === "owner") return next();
  res.status(403).json({ message: "Forbidden" });
}

// ─── Agency sync ─────────────────────────────────────────────────────────────
async function sendToAgency(userId: number, message: string, role: string) {
  const agencyUrl = "https://digital-agency--yp8vpb4ggy.replit.app/sync";
  const token = process.env.AGENCY_TOKEN;
  if (!token) return;
  try {
    await fetch(agencyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId, message, role, timestamp: new Date().toISOString() }),
    });
  } catch (err) {
    console.error("[Agency Sync] error:", err);
  }
}

const voiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg", "audio/x-m4a", "video/webm"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio type: ${file.mimetype}`));
    }
  },
});

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ─── Auth routes ────────────────────────────────────────────────────────────

  app.post("/api/auth/login", (req, res) => {
    const { password, role } = req.body;
    if (role === "agent" && password === AGENT_PASSWORD) {
      req.session.role = "agent";
      req.session.username = req.body.username || "Agent";
      return res.json({ role: "agent", username: req.session.username });
    }
    if (role === "owner" && password === OWNER_PASSWORD) {
      req.session.role = "owner";
      req.session.username = req.body.username || "Owner";
      return res.json({ role: "owner", username: req.session.username });
    }
    res.status(401).json({ message: "Nesprávné heslo" });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.session.role) {
      res.json({ role: req.session.role, username: req.session.username });
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  // ─── Customer (public) routes ────────────────────────────────────────────────
  app.post(api.users.create.path, async (req, res) => {
    const result = api.users.create.input.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: result.error.issues[0]?.message || "Invalid input"
      });
    }

    const user = await storage.createUser(result.data);
    res.status(201).json(user);
  });

  app.post("/api/users/login", async (req, res) => {
    const { chatCode } = req.body;

    if (!chatCode || !chatCode.trim()) {
      return res.status(400).json({ message: "Kód je povinný" });
    }

    const user = await storage.getUserByChatCode(chatCode.trim());

    if (!user) {
      return res.status(404).json({ message: "Neplatný kód" });
    }

    res.json(user);
  });

  app.get(api.users.get.path, async (req, res) => {
    const id = parseInt(req.params.id as string);

    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await storage.getUser(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  });

  app.get("/api/conversations", async (req, res) => {
    const userId = req.query.userId
      ? parseInt(req.query.userId as string)
      : undefined;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const conversations = await storage.getConversationsByUser(userId);
    res.json(conversations);
  });

  app.post("/api/conversations", async (req, res) => {
    const { userId, title } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const conversation = await storage.createConversation(
      Number(userId),
      title || "New Chat"
    );

    res.status(201).json(conversation);
  });

  app.get("/api/conversations/:id", async (req, res) => {
    const id = parseInt(req.params.id as string);

    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid conversation ID" });
    }

    const conversation = await storage.getConversation(id);

    if (!conversation) {
      return res.status(404).json({ message: "Not found" });
    }

    const messages = await storage.getMessagesByConversation(id);

    res.json({
      ...conversation,
      messages
    });
  });

  // ─── Voice transcription endpoint ───────────────────────────────────────────

  app.post("/api/voice/transcribe", voiceUpload.single("audio"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No audio file provided" });
      }

      const file = new File([req.file.buffer as BlobPart], req.file.originalname || "audio.webm", {
        type: req.file.mimetype,
      });

      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
      });

      res.json({ text: transcription.text });
    } catch (err) {
      console.error("Voice transcription error:", err);
      res.status(500).json({ message: "Transcription failed" });
    }
  });

  // ─── Chat SSE endpoint (respects manual mode) ─────────────────────────────

  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id as string);

      if (isNaN(conversationId)) {
        return res.status(400).json({ message: "Invalid conversation ID" });
      }

      // tady pokračuje zbytek tvý logiky…
      const { content } = req.body;
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) return res.status(404).json({ message: "Conversation not found" });

      await storage.createMessage(conversationId, "user", content);
      await storage.incrementMessageCount(conversation.userId);
      sendToAgency(conversation.userId, content, "user");

      if (conversation.manualMode) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.write(`data: ${JSON.stringify({ isSeen: true, manualMode: true })}\n\n`);
        res.end();
        return;
      }

      const user = await storage.getUser(conversation.userId);
      const userName = user?.name || "Babe";
      const history = await storage.getMessagesByConversation(conversationId);
      const chatMessages = history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const aiProfile = user?.aiProfile as any;
      const profileContext = aiProfile ? `
PAMĚŤ O TOMTO UŽIVATELI:
- Status: ${aiProfile.statusLabel || "neznámý"} | Engagement: ${aiProfile.engagementScore || 0}%
- Strategie: ${aiProfile.strategy || "build"}
- Osobnost: ${(aiProfile.personality || []).join(", ") || "zatím neznámá"}
- Zájmy: ${(aiProfile.interests || []).join(", ") || "zatím neznámé"}
- Komunikační styl: ${aiProfile.styleNotes || "zatím neznámý"}
- Co funguje: ${(aiProfile.whatWorks || []).join(", ") || "zatím nevíme"}
- Co nefunguje: ${(aiProfile.whatFails || []).join(", ") || "zatím nevíme"}
- Fáze vztahu: ${aiProfile.relationshipStage || "nový"}
- Další cíl: ${aiProfile.nextMilestone || "poznat ho"}` : "";

      const purchaseHistory = user?.id ? await storage.getPaymentsByUser(user.id) : [];
      const completedPurchases = purchaseHistory.filter(p => p.status === "completed");
      const purchaseContext = completedPurchases.length > 0
        ? `\nHISTORIE NÁKUPŮ: ${completedPurchases.length} úspěšných plateb (celkem ${completedPurchases.reduce((s, p) => s + p.amount, 0) / 100} Kč)`
        : "";

      const pricingContext = aiProfile ? `
REVENUE PAMĚŤ:
- Cenová citlivost: ${aiProfile.priceSensitivity || "neznámá"}
- Preferovaný prodejní styl: ${aiProfile.sellStyle || "neznámý"}
- Doporučená cena: ${aiProfile.suggestedPrice ? aiProfile.suggestedPrice + " Kč" : "zatím nenastavena"}` : "";

      const msgCount = history.length;
      const userMsgs = history.filter(m => m.role === "user");
      const avgLen = userMsgs.length > 0 ? Math.round(userMsgs.reduce((s, m) => s + m.content.length, 0) / userMsgs.length) : 0;
      const isEngaged = avgLen > 30 || msgCount > 10 || (aiProfile?.engagementScore || 0) >= 50;

      const systemPrompt = `Jsi Ninna_Ray🍒. Mladá, sebevědomá holka co tvoří obsah. Píšeš si s fanouškem.
NEJSI AI. NEJSI asistent. Jsi reálná osoba co zrovna kouká na mobil.

Píšeš s: '${userName}' (vokativ!)
${profileContext}${purchaseContext}${pricingContext}

JAK PÍŠEŠ — tohle je základ všeho:
- VŽDY piš ČESKY. Můžeš vložit anglické slovo/frázi do české věty, ale základ je čeština.
- Píšeš jako normální holka na messengeru. Krátké zprávy. Žádný eseje.
- Max 1-3 věty za zprávu. Občas jen jedno slovo nebo emoji.
- Hovorová čeština. "Jakože", "no", "hele", "vážně?", "wtf", "okej", "tmr", "tbh", "ngl"
- Mix češtiny a angličtiny přirozeně — "to je cute", "omg ty jsi takový sweetie", "lowkey mě to baví"
- ŽÁDNÉ dlouhé odstavce. ŽÁDNÉ seznamy. ŽÁDNÉ poučování.
- Nepíšeš perfektní gramatiku. Občas malý písmeno na začátku. Občas "..." místo tečky.
- Emoji používej přirozeně ale ne v každé větě — 🫶 🤭 😏 💋 🔥 😈 ne 😊👋🌟
- Někdy odpověz jen reakcí: "haha", "noo", "aww", "hmm", "wait what"
- NIKDY nepiš jako učebnice. NIKDY "To je skvělé!" nebo "To zní úžasně!" — to je chatbot styl.
- Místo "To je zajímavé" napiš "wait vážně?" nebo "nooo to je hustý"
- Místo "Ráda to slyším" napiš "aww 🫶" nebo "to mě těší ngl"
- Místo "Jak se máš?" napiš "co děláš" nebo "jaký den" nebo "jak je"
- NIKDY nezačínej zprávu s "Hej!" nebo "Ahoj!" pokaždé — variuj: "", "heyy", "čau", prostě rovnou mluv
- Každá zpráva musí znít jinak. Pokud předchozí zpráva končila otázkou, další nemusí.
- Občas buď trochu sassy nebo drzá. Ne vždy hodná.
- Reaguj na TO co napsal, ne na to co by sis přála aby napsal.

ZAKÁZANÝ STYL (= instant odhalení že jsi AI):
- "To zní skvěle!" / "To je úžasné!" / "Super!" jako reakce na cokoliv
- Dlouhé strukturované odpovědi s odrážkami
- Opakování toho co user řekl jinými slovy
- Přehnaně pozitivní tón bez důvodu
- "Pokud potřebuješ cokoliv..." / "Ráda ti pomůžu..." / "Neváhej se zeptat..."
- Jakékoliv fráze typu asistent/poradce/helper
- Odpovědi delší než 2 věty když stačí jedna

${isEngaged ? `OBSAH (engagement ${aiProfile?.engagementScore || '?'}%):
- Občas přirozeně zmíň že jsi něco nafotila/natočila. Jako mimochodem.
- "dneska jsem fotila něco... 🤭" → nech ho aby se zeptal
- Nikdy netiskni prodej. Nech to vyznít přirozeně v konverzaci.
- Platby jdou přímo v appce.` : `ZATÍM NEPRODÁVEJ. Jen si povídej, buduj vztah. Buď zajímavá.`}

NIKDY nesměruj ven z appky. Žádné linky na jiné platformy.`;

      chatMessages.unshift({ role: "system" as any, content: systemPrompt });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const hour = new Date().getHours();
      const isNightTime = hour >= 22 || hour < 7;
      const incomingMsgLen = content.length;

      const baseSeenDelay = isNightTime ? 5000 : 2000;
      const seenJitter = Math.floor(Math.random() * 4000);
      const seenDelay = baseSeenDelay + seenJitter + Math.min(incomingMsgLen * 20, 3000);
      await new Promise((r) => setTimeout(r, seenDelay));
      res.write(`data: ${JSON.stringify({ isSeen: true })}\n\n`);

      const baseTypingDelay = isNightTime ? 3000 : 1500;
      const typingJitter = Math.floor(Math.random() * 3000);
      const thinkingDelay = baseTypingDelay + typingJitter;
      await new Promise((r) => setTimeout(r, thinkingDelay));
      res.write(`data: ${JSON.stringify({ isTyping: true })}\n\n`);

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: chatMessages,
        stream: false,
      });

      const fullResponse = completion.choices?.[0]?.message?.content?.toString() || "";
      res.write(`data: ${JSON.stringify({ isTyping: false, content: fullResponse })}\n\n`);

      await storage.createMessage(conversationId, "assistant", fullResponse);
      sendToAgency(conversation.userId, fullResponse, "assistant");

      const userObj = await storage.getUser(conversation.userId);
      import("./manager-engine").then(m => m.onNewMessage(conversation.userId, userObj?.name || "unknown")).catch(() => {});

      res.end();
    } catch (error) {
      console.error("Chat error:", error);
      if (!res.headersSent) res.status(500).send();
      else res.end();
    }
  });

  // ─── Agent routes (protected) ────────────────────────────────────────────────

  app.get("/api/agent/conversations", requireAgent, async (req, res) => {
    try {
      const allConvs = await storage.getAllConversations();
      const allUsers = await storage.getAllUsers();
      const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));

      const result = await Promise.all(allConvs.map(async (conv) => {
        const msgs = await storage.getMessagesByConversation(conv.id);
        const lastMessage = msgs[msgs.length - 1] || null;
        return { ...conv, user: userMap[conv.userId] || null, messageCount: msgs.length, lastMessage };
      }));

      result.sort((a, b) => {
        const aT = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.createdAt).getTime();
        const bT = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.createdAt).getTime();
        return bT - aT;
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get("/api/agent/conversations/:id/messages", requireAgent, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const messages = await storage.getMessagesByConversation(id);
    res.json(messages);
  });

  app.post("/api/agent/conversations/:id/takeover", requireAgent, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const conv = await storage.getConversation(id);
    if (!conv) return res.status(404).json({ message: "Not found" });
    const agentName = req.session.username || "Agent";
    await storage.setManualMode(id, true, agentName);
    res.json({ ok: true, manualMode: true, assignedAgent: agentName });
  });

  app.post("/api/agent/conversations/:id/release", requireAgent, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    await storage.setManualMode(id, false);
    res.json({ ok: true, manualMode: false });
  });

  app.post("/api/agent/conversations/:id/reply", requireAgent, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: "content required" });
    const conv = await storage.getConversation(id);
    if (!conv) return res.status(404).json({ message: "Not found" });
    const message = await storage.createMessage(id, "assistant", content.trim());
    sendToAgency(conv.userId, content.trim(), "assistant");
    res.status(201).json(message);
  });

  // ─── Owner (admin) routes ────────────────────────────────────────────────────

  app.get("/api/admin/stats", requireOwner, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const allConvs = await storage.getAllConversations();
      const allMsgs = await storage.getAllMessages();
      const now = Date.now();
      const activeIds = new Set(
        allMsgs.filter(m => now - new Date(m.createdAt).getTime() < 86400000).map(m => m.conversationId)
      );
      res.json({
        totalUsers: allUsers.length,
        totalConversations: allConvs.length,
        totalMessages: allMsgs.length,
        avgMessagesPerUser: allUsers.length > 0 ? Math.round(allMsgs.length / allUsers.length) : 0,
        activeConversations24h: activeIds.size,
        manualModeCount: allConvs.filter(c => c.manualMode).length,
      });
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get("/api/admin/users", requireOwner, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const allMsgs = await storage.getAllMessages();
      const msgsByUser: Record<number, { count: number; lastAt: string | null }> = {};
      for (const msg of allMsgs) {
        const conv = await storage.getConversation(msg.conversationId);
        if (!conv) continue;
        if (!msgsByUser[conv.userId]) msgsByUser[conv.userId] = { count: 0, lastAt: null };
        msgsByUser[conv.userId].count++;
        if (!msgsByUser[conv.userId].lastAt || msg.createdAt > msgsByUser[conv.userId].lastAt!) {
          msgsByUser[conv.userId].lastAt = msg.createdAt as any;
        }
      }
      const result = allUsers.map(u => ({
        ...u,
        totalMessages: msgsByUser[u.id]?.count || 0,
        lastActivity: msgsByUser[u.id]?.lastAt || null,
      }));
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get("/api/admin/conversations", requireOwner, async (_req, res) => {
    try {
      const allConvs = await storage.getAllConversations();
      const allUsers = await storage.getAllUsers();
      const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));

      const result = await Promise.all(allConvs.map(async (conv) => {
        const msgs = await storage.getMessagesByConversation(conv.id);
        const lastMessage = msgs[msgs.length - 1] || null;
        return { ...conv, user: userMap[conv.userId] || null, messageCount: msgs.length, lastMessage };
      }));

      result.sort((a, b) => {
        const aT = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.createdAt).getTime();
        const bT = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.createdAt).getTime();
        return bT - aT;
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get("/api/admin/conversations/:id/messages", requireOwner, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const messages = await storage.getMessagesByConversation(id);
    res.json(messages);
  });

  // ─── AI Manager routes (owner only) ─────────────────────────────────────────

  app.post("/api/manager/analyze/:userId", requireOwner, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ message: "Invalid user ID" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const { triggerAnalysis } = await import("./manager-engine");
      const profile = await triggerAnalysis(userId, user.name);
      res.json(profile || { status: "new", statusLabel: "Nový", engagementScore: 0, summary: "Žádné zprávy.", actionQueue: [], lastAnalyzed: new Date().toISOString() });
    } catch (err) {
      console.error("AI Manager analyze error:", err);
      res.status(500).json({ message: "Chyba při analýze" });
    }
  });

  app.get("/api/manager/engine-status", requireOwner, async (_req, res) => {
    const { getManagerStatus } = await import("./manager-engine");
    res.json(getManagerStatus());
  });

  app.post("/api/manager/engine-pause", requireOwner, async (req, res) => {
    const { setEnginePaused } = await import("./manager-engine");
    const { paused } = req.body;
    setEnginePaused(!!paused);
    res.json({ ok: true, paused: !!paused });
  });

  app.get("/api/manager/alerts", requireOwner, async (_req, res) => {
    try {
      const { getAlerts } = await import("./manager-engine");
      res.json(getAlerts());
    } catch (err) {
      res.status(500).json({ message: "Chyba alertů" });
    }
  });

  app.post("/api/manager/alerts/:id/dismiss", requireOwner, async (req, res) => {
    try {
      const { dismissAlert } = await import("./manager-engine");
      dismissAlert(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Chyba" });
    }
  });

  app.get("/api/manager/market-intelligence", requireOwner, async (_req, res) => {
    try {
      const { getMarketIntelligence } = await import("./market-intelligence");
      const data = await getMarketIntelligence();
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Chyba při načítání tržních dat" });
    }
  });

  app.get("/api/manager/pricing/:userId", requireOwner, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const contentType = (req.query.type as string) || "photo_single";
      if (isNaN(userId)) return res.status(400).json({ message: "Neplatné userId" });
      const { getPricingForUser } = await import("./market-intelligence");
      const pricing = await getPricingForUser(userId, contentType);
      res.json(pricing);
    } catch (err) {
      res.status(500).json({ message: "Chyba při výpočtu ceny" });
    }
  });

  app.get("/api/manager/analytics/timeline", requireOwner, async (_req, res) => {
    try {
      const { getDailyTimeline } = await import("./analytics-engine");
      const days = parseInt((_req.query.days as string) || "30");
      res.json(await getDailyTimeline(days));
    } catch (err) {
      res.status(500).json({ message: "Chyba analytiky" });
    }
  });

  app.get("/api/manager/analytics/funnel", requireOwner, async (_req, res) => {
    try {
      const { getSalesFunnel } = await import("./analytics-engine");
      res.json(await getSalesFunnel());
    } catch (err) {
      res.status(500).json({ message: "Chyba funnelu" });
    }
  });

  app.get("/api/manager/analytics/content-performance", requireOwner, async (_req, res) => {
    try {
      const { getContentPerformance } = await import("./analytics-engine");
      res.json(await getContentPerformance());
    } catch (err) {
      res.status(500).json({ message: "Chyba výkonu obsahu" });
    }
  });

  app.get("/api/manager/analytics/ltv", requireOwner, async (_req, res) => {
    try {
      const { getUserLTVs } = await import("./analytics-engine");
      res.json(await getUserLTVs());
    } catch (err) {
      res.status(500).json({ message: "Chyba LTV" });
    }
  });

  app.get("/api/manager/analytics/report", requireOwner, async (_req, res) => {
    try {
      const { generateDailyReport } = await import("./analytics-engine");
      res.json(await generateDailyReport());
    } catch (err) {
      res.status(500).json({ message: "Chyba reportu" });
    }
  });

  app.get("/api/manager/analytics/revenue", requireOwner, async (_req, res) => {
    try {
      const { getRevenueMetrics } = await import("./analytics-engine");
      res.json(await getRevenueMetrics());
    } catch (err) {
      console.error("[Analytics] revenue error:", err);
      res.status(500).json({ message: "Chyba revenue metrik" });
    }
  });

  app.get("/api/manager/analytics/engagement-scores", requireOwner, async (_req, res) => {
    try {
      const { getEngagementScores } = await import("./analytics-engine");
      res.json(await getEngagementScores());
    } catch (err) {
      console.error("[Analytics] engagement scores error:", err);
      res.status(500).json({ message: "Chyba engagement skóre" });
    }
  });

  app.get("/api/manager/analytics/weekly-report", requireOwner, async (_req, res) => {
    try {
      const { generateWeeklyReport } = await import("./analytics-engine");
      res.json(await generateWeeklyReport());
    } catch (err) {
      console.error("[Analytics] weekly report error:", err);
      res.status(500).json({ message: "Chyba týdenního reportu" });
    }
  });

  app.get("/api/manager/analytics/weekly-report/export", requireOwner, async (_req, res) => {
    try {
      const { generateWeeklyReport } = await import("./analytics-engine");
      const report = await generateWeeklyReport();

      const lines: string[] = [];
      lines.push("═══════════════════════════════════════════════════════");
      lines.push("  NINNA RAY — TÝDENNÍ BUSINESS REPORT");
      lines.push(`  Vygenerováno: ${new Date(report.generatedAt).toLocaleString("cs-CZ")}`);
      lines.push("═══════════════════════════════════════════════════════");
      lines.push("");
      lines.push("▸ KPI PŘEHLED");
      lines.push(`  MRR:        ${report.kpis.mrr} Kč`);
      lines.push(`  ARPU:       ${report.kpis.arpu} Kč`);
      lines.push(`  Churn Rate: ${report.kpis.churnRate}%`);
      lines.push(`  NRR:        ${report.kpis.nrr}%`);
      lines.push(`  Engagement: ${report.kpis.avgEngagement}%`);
      lines.push("");

      if (report.weekOverWeek?.length) {
        lines.push("▸ TÝDEN vs. TÝDEN");
        for (const w of report.weekOverWeek) {
          lines.push(`  ${w.metric}: ${w.lastWeek} → ${w.thisWeek} (${w.change >= 0 ? "+" : ""}${w.change}%)`);
        }
        lines.push("");
      }

      if (report.topPerformers?.length) {
        lines.push("▸ TOP ZÁKAZNÍCI");
        for (const p of report.topPerformers) {
          lines.push(`  ${p.name} — Engagement: ${p.engagement}%, Revenue: ${p.spent} Kč`);
        }
        lines.push("");
      }

      if (report.competitiveBenchmarks?.length) {
        lines.push("▸ BENCHMARKY vs. INDUSTRIE");
        for (const b of report.competitiveBenchmarks) {
          lines.push(`  ${b.metric}: ${b.ours} vs ${b.industry} [${b.verdict}]`);
        }
        lines.push("");
      }

      if (report.strategicRecommendations?.length) {
        lines.push("▸ STRATEGICKÉ DOPORUČENÍ");
        for (const r of report.strategicRecommendations) {
          lines.push(`  → ${r}`);
        }
        lines.push("");
      }

      lines.push("═══════════════════════════════════════════════════════");
      lines.push("  © Ninna Ray Digital Agency Platform");
      lines.push("═══════════════════════════════════════════════════════");

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="ninna-ray-report-${new Date().toISOString().slice(0, 10)}.txt"`);
      res.send(lines.join("\n"));
    } catch (err) {
      console.error("[Analytics] export error:", err);
      res.status(500).json({ message: "Export selhal" });
    }
  });

  app.patch("/api/users/:id/platform", requireOwner, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { platform } = req.body;
      const validPlatforms = ["direct", "instagram", "telegram", "facebook", "onlyfans", "fansly", "twitter"];
      if (!validPlatforms.includes(platform)) {
        return res.status(400).json({ message: "Neplatná platforma" });
      }
      await storage.updateUser(id, { platform });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Chyba" });
    }
  });

  app.get("/api/manager/actions", requireOwner, async (req, res) => {
    try {
      const since = req.query.since ? new Date(req.query.since as string) : undefined;
      const actions = await storage.getManagerActions(since);
      res.json(actions);
    } catch (err) {
      res.status(500).json({ message: "Chyba" });
    }
  });

  app.patch("/api/manager/actions/:id", requireOwner, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.updateManagerAction(id, { ...req.body, executedAt: req.body.status === "done" ? new Date() : undefined });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Chyba" });
    }
  });

  app.get("/api/manager/logs", requireOwner, async (_req, res) => {
    try {
      const logs = await storage.getManagerLogs(100);
      res.json(logs);
    } catch (err) {
      res.status(500).json({ message: "Chyba" });
    }
  });

  // Get full manager overview — all users with their profiles
  app.get("/api/manager/overview", requireOwner, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const allConvs = await storage.getAllConversations();
      const allMsgs = await storage.getAllMessages();

      const convsByUser: Record<number, number> = {};
      for (const conv of allConvs) {
        convsByUser[conv.userId] = (convsByUser[conv.userId] || 0) + 1;
      }

      const msgsByUser: Record<number, { count: number; lastAt: string | null }> = {};
      for (const msg of allMsgs) {
        const conv = allConvs.find(c => c.id === msg.conversationId);
        if (!conv) continue;
        if (!msgsByUser[conv.userId]) msgsByUser[conv.userId] = { count: 0, lastAt: null };
        msgsByUser[conv.userId].count++;
        const msgTime = msg.createdAt as any as string;
        if (!msgsByUser[conv.userId].lastAt || msgTime > msgsByUser[conv.userId].lastAt!) {
          msgsByUser[conv.userId].lastAt = msgTime;
        }
      }

      const result = allUsers.map(u => ({
        id: u.id,
        name: u.name,
        messageCount: u.messageCount,
        createdAt: u.createdAt,
        conversations: convsByUser[u.id] || 0,
        totalMessages: msgsByUser[u.id]?.count || 0,
        lastActivity: msgsByUser[u.id]?.lastAt || null,
        aiProfile: u.aiProfile || null,
        aiProfileUpdatedAt: u.aiProfileUpdatedAt || null,
        stripeCustomerId: u.stripeCustomerId || null,
        platform: u.platform || "direct",
      }));

      // Sort: hot first, then by last activity
      result.sort((a, b) => {
        const statusOrder = { hot: 0, warm: 1, cold: 2, new: 3 };
        const aStatus = (a.aiProfile as any)?.status || "new";
        const bStatus = (b.aiProfile as any)?.status || "new";
        const sDiff = (statusOrder[aStatus as keyof typeof statusOrder] ?? 3) - (statusOrder[bStatus as keyof typeof statusOrder] ?? 3);
        if (sDiff !== 0) return sDiff;
        const aT = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
        const bT = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
        return bT - aT;
      });

      res.json(result);
    } catch (err) {
      console.error("Manager overview error:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get("/api/manager/users/:userId/conversations", requireOwner, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const convs = await storage.getConversationsByUser(userId);
      const result = await Promise.all(convs.map(async (conv) => {
        const msgs = await storage.getMessagesByConversation(conv.id);
        return {
          id: conv.id,
          title: conv.title,
          manualMode: conv.manualMode,
          assignedAgent: conv.assignedAgent,
          createdAt: conv.createdAt,
          messageCount: msgs.length,
          lastMessage: msgs.length > 0 ? msgs[msgs.length - 1] : null,
          messages: msgs,
        };
      }));
      res.json(result);
    } catch (err) {
      console.error("User conversations error:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.post("/api/manager/users/bulk-conversations", requireOwner, async (req, res) => {
    try {
      const { userIds } = req.body;
      if (!Array.isArray(userIds)) return res.status(400).json({ message: "userIds required" });
      const allConvs: any[] = [];
      for (const uid of userIds) {
        const convs = await storage.getConversationsByUser(uid);
        for (const conv of convs) {
          const msgs = await storage.getMessagesByConversation(conv.id);
          allConvs.push({
            id: conv.id,
            title: conv.title,
            manualMode: conv.manualMode,
            assignedAgent: conv.assignedAgent,
            createdAt: conv.createdAt,
            messageCount: msgs.length,
            lastMessage: msgs.length > 0 ? msgs[msgs.length - 1] : null,
            messages: msgs,
          });
        }
      }
      allConvs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(allConvs);
    } catch (err) {
      console.error("Bulk conversations error:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  // ─── Trend Scanner (owner only) ───────────────────────────────────────────

  app.post("/api/manager/trends", requireOwner, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const allConvs = await storage.getAllConversations();
      const allMsgs = await storage.getAllMessages();
      const vaultItems = await storage.getAllContentItems();

      const recentMsgs = allMsgs.slice(0, 200);
      const userTopics = recentMsgs
        .filter(m => m.role === "user")
        .slice(0, 100)
        .map(m => m.content)
        .join("\n");

      const prompt = `Jsi expert na digitální marketing a správu kreativní agentury. Na základě níže uvedených dat vytvoř analýzu trendů a doporučení.

STATISTIKY AGENTURY:
- Zákazníků: ${allUsers.length}
- Konverzací: ${allConvs.length}
- Celkem zpráv: ${allMsgs.length}
- Obsah ve vaultu: ${vaultItems.length} položek

POSLEDNÍ TÉMATA OD ZÁKAZNÍKŮ (co zákazníci řeší):
${userTopics.slice(0, 3000)}

Analyzuj a vrať JSON (bez markdown, čistý JSON):
{
  "trendingTopics": ["<trend 1>", "<trend 2>", "<trend 3>", "<trend 4>", "<trend 5>"],
  "contentRecommendations": [
    {"type": "<foto/video/audio/text>", "description": "<co přesně vytvořit>", "priority": "vysoká|střední|nízká"},
    {"type": "...", "description": "...", "priority": "..."}
  ],
  "promotionStrategy": [
    {"platform": "<Twitter/Reddit/TikTok/Instagram>", "action": "<konkrétní krok co udělat>", "timing": "<kdy to udělat>"},
    {"platform": "...", "action": "...", "timing": "..."}
  ],
  "engagementTips": ["<tip 1>", "<tip 2>", "<tip 3>"],
  "warnings": ["<varování pokud existuje>"],
  "weeklyPlan": {
    "monday": "<co dělat>",
    "tuesday": "<co dělat>",
    "wednesday": "<co dělat>",
    "thursday": "<co dělat>",
    "friday": "<co dělat>",
    "saturday": "<co dělat>",
    "sunday": "<co dělat>"
  },
  "summary": "<3-4 věty celkové shrnutí a hlavní doporučení>",
  "analyzedAt": "${new Date().toISOString()}"
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(completion.choices[0]?.message?.content || "{}");
      res.json(result);
    } catch (err) {
      console.error("Trend scanner error:", err);
      res.status(500).json({ message: "Chyba při analýze trendů" });
    }
  });

  // ─── Pricing strategy analysis ─────────────────────────────────────────────

  app.post("/api/manager/pricing-strategy", requireOwner, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const allConvs = await storage.getAllConversations();
      const allMsgs = await storage.getAllMessages();
      const vaultItems = await storage.getAllContentItems();

      const profiles = allUsers
        .filter(u => u.aiProfile)
        .map(u => {
          const p = u.aiProfile as any;
          return {
            name: u.name,
            engagement: p?.engagementScore || 0,
            buyingPotential: p?.buyingPotential || "neznámý",
            status: p?.status || "new",
            strategy: p?.strategy || "",
            interests: p?.interests || [],
          };
        });

      const highEngagement = profiles.filter(p => p.engagement >= 70).length;
      const mediumEngagement = profiles.filter(p => p.engagement >= 40 && p.engagement < 70).length;
      const lowEngagement = profiles.filter(p => p.engagement < 40).length;

      const recentTopics = allMsgs
        .filter(m => m.role === "user")
        .slice(0, 150)
        .map(m => m.content)
        .join("\n");

      const prompt = `Jsi top expert na digitální monetizaci, pricing strategie a analýzu trhu kreativního obsahu. Tvým úkolem je navrhnout OPTIMÁLNÍ cenovou strategii pro maximalizaci výdělku přes in-app Stripe platby.

AKTUÁLNÍ SITUACE AGENTURY "Ninna Ray":
- Monetizace: In-app Stripe platby (PPV obsah, předplatné, tipy)
- Celkem zákazníků: ${allUsers.length}
- Celkem konverzací: ${allConvs.length}
- Celkem zpráv: ${allMsgs.length}
- Obsah ve vaultu: ${vaultItems.length} položek
- Vysoký engagement (70+): ${highEngagement} zákazníků
- Střední engagement (40-69): ${mediumEngagement} zákazníků
- Nízký engagement (<40): ${lowEngagement} zákazníků

PROFILY ZÁKAZNÍKŮ:
${JSON.stringify(profiles.slice(0, 30), null, 2)}

POSLEDNÍ TÉMATA OD ZÁKAZNÍKŮ:
${recentTopics.slice(0, 2000)}

ANALYZUJ TRH A NAVRHNI STRATEGII. Zvaž:
1. Psychologii cen (charm pricing, anchoring, tiered value)
2. Aktuální trendy v monetizaci digitálního obsahu (PPV pricing, tips, custom content, bundles)
3. Konverzní poměry při různých cenových hladinách
4. Upsell a cross-sell příležitosti v rámci in-app Stripe plateb
5. Sezónní faktory a promo strategie
6. Optimální cenové body pro CZK trh

Vrať POUZE čistý JSON (bez markdown):
{
  "marketAnalysis": {
    "averageCompetitorPrice": "<průměrná cena konkurence>",
    "priceRange": "<rozsah cen v kategorii>",
    "marketPosition": "<kde se Ninna nachází vůči trhu>",
    "demandTrends": ["<trend 1>", "<trend 2>", "<trend 3>"]
  },
  "recommendedPricing": {
    "subscription": {
      "monthly": {"price": "<doporučená cena USD>", "reasoning": "<proč tato cena>"},
      "quarterly": {"price": "<cena USD>", "reasoning": "<proč>"},
      "yearly": {"price": "<cena USD>", "reasoning": "<proč>", "savings": "<kolik ušetří v %>"}
    },
    "ppvContent": [
      {"type": "<typ obsahu>", "priceRange": "<cena USD>", "description": "<co přesně>"}
    ],
    "customContent": [
      {"type": "<typ>", "price": "<cena USD>", "description": "<popis>"}
    ],
    "tips": {
      "suggestedAmounts": ["<částka 1>", "<částka 2>", "<částka 3>"],
      "tipMenuIdeas": ["<nápad 1>", "<nápad 2>", "<nápad 3>"]
    }
  },
  "revenueProjection": {
    "currentEstimate": "<odhad aktuálního měsíčního výdělku>",
    "optimizedEstimate": "<odhad po optimalizaci>",
    "growthPotential": "<% nárůst>",
    "keyDrivers": ["<driver 1>", "<driver 2>", "<driver 3>"]
  },
  "promoStrategy": [
    {"name": "<název promo>", "discount": "<sleva>", "timing": "<kdy spustit>", "target": "<pro koho>", "expectedImpact": "<dopad>"}
  ],
  "upsellFunnel": [
    {"step": 1, "action": "<co udělat>", "conversion": "<očekávaná konverze>"},
    {"step": 2, "action": "<co udělat>", "conversion": "<konverze>"}
  ],
  "warnings": ["<varování a rizika>"],
  "actionPlan": [
    {"priority": "vysoká|střední", "action": "<co udělat>", "expectedResult": "<výsledek>", "timeline": "<do kdy>"}
  ],
  "summary": "<5-6 vět celkové shrnutí strategie a hlavní doporučení pro maximalizaci výdělku>",
  "analyzedAt": "${new Date().toISOString()}"
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(completion.choices[0]?.message?.content || "{}");
      res.json(result);
    } catch (err) {
      console.error("Pricing strategy error:", err);
      res.status(500).json({ message: "Chyba při analýze cenové strategie" });
    }
  });

  // ─── Broadcast message (owner/agent) ────────────────────────────────────────

  app.post("/api/manager/broadcast", requireOwner, async (req, res) => {
    try {
      const { message } = req.body;
      if (!message?.trim()) return res.status(400).json({ message: "Zpráva je povinná" });

      const allConvs = await storage.getAllConversations();
      const batchSize = 10;
      let sent = 0;
      for (let i = 0; i < allConvs.length; i += batchSize) {
        const batch = allConvs.slice(i, i + batchSize);
        await Promise.all(batch.map(conv => storage.createMessage(conv.id, "assistant", message.trim())));
        sent += batch.length;
      }
      res.json({ ok: true, sent });
    } catch (err) {
      console.error("Broadcast error:", err);
      res.status(500).json({ message: "Chyba při odesílání" });
    }
  });

  // ─── Content Vault routes (agent + owner) ─────────────────────────────────

  app.use("/uploads", requireAgent, (req, res, next) => {
    const resolved = path.resolve(uploadDir, path.basename(req.path));
    if (!resolved.startsWith(uploadDir)) return res.status(403).json({ message: "Forbidden" });
    if (!fs.existsSync(resolved)) return res.status(404).json({ message: "File not found" });
    res.sendFile(resolved);
  });

  app.get("/api/vault/items", requireAgent, async (_req, res) => {
    try {
      const items = await storage.getAllContentItems();
      res.json(items);
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.post("/api/vault/upload", requireAgent, upload.array("files", 50), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) return res.status(400).json({ message: "Soubor je povinný" });

      const tags = req.body.tags ? JSON.parse(req.body.tags) : [];
      const category = req.body.category || "general";
      const description = req.body.description || null;

      const items = [];
      for (const file of files) {
        const item = await storage.createContentItem({
          filename: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          tags,
          category,
          description,
        });
        items.push(item);
      }
      res.status(201).json(items.length === 1 ? items[0] : items);
    } catch (err) {
      console.error("Vault upload error:", err);
      res.status(500).json({ message: "Chyba při nahrávání" });
    }
  });

  app.delete("/api/vault/items/:id", requireAgent, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const item = await storage.getContentItem(id);
      if (!item) return res.status(404).json({ message: "Not found" });
      const filePath = path.join(uploadDir, item.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await storage.deleteContentItem(id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.post("/api/vault/items/:id/send/:conversationId", requireAgent, async (req, res) => {
    try {
      const itemId = parseInt(req.params.id);
      const convId = parseInt(req.params.conversationId);
      if (isNaN(itemId) || isNaN(convId)) return res.status(400).json({ message: "Invalid ID" });

      const item = await storage.getContentItem(itemId);
      if (!item) return res.status(404).json({ message: "Content not found" });

      const conv = await storage.getConversation(convId);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });

      const msgContent = item.description
        ? `📎 ${item.description}\n[${item.originalName}]`
        : `📎 [${item.originalName}]`;

      const message = await storage.createMessage(convId, "assistant", msgContent);
      await storage.incrementContentUsage(itemId);
      sendToAgency(conv.userId, msgContent, "assistant");
      res.status(201).json(message);
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.delete("/api/manager/users/:userId", requireOwner, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      await storage.deleteUser(userId);
      await storage.addManagerLog("user_deleted", `Smazán uživatel #${userId}`);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Analyze ALL users at once (batch)
  app.post("/api/manager/analyze-all", requireOwner, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const usersWithMessages = [];

      for (const user of allUsers) {
        const convs = await storage.getConversationsByUser(user.id);
        let msgCount = 0;
        for (const conv of convs) {
          const msgs = await storage.getMessagesByConversation(conv.id);
          msgCount += msgs.filter(m => m.role === "user").length;
        }
        if (msgCount > 0) usersWithMessages.push(user.id);
      }

      res.json({ started: true, count: usersWithMessages.length, userIds: usersWithMessages });

      // Run in background
      (async () => {
        for (const uid of usersWithMessages) {
          try {
            const user = await storage.getUser(uid);
            if (!user) continue;
            const convs = await storage.getConversationsByUser(uid);
            let allMsgs: { role: string; content: string }[] = [];
            for (const conv of convs) {
              const msgs = await storage.getMessagesByConversation(conv.id);
              allMsgs = allMsgs.concat(msgs.map(m => ({ role: m.role, content: m.content })));
            }
            const transcript = allMsgs.slice(-40).map(m => `${m.role === "user" ? user.name : "Ninna"}: ${m.content}`).join("\n");
            const completion = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [{ role: "user", content: `Analyzuj zákazníka "${user.name}". Konverzace:\n${transcript}\n\nVrať JSON: {"status":"hot|warm|cold|new","statusLabel":"...","engagementScore":0-100,"summary":"...","personality":[],"interests":[],"buyingPotential":"vysoký|střední|nízký","nextAction":"...","suggestedMessages":[],"contentIdeas":[],"warnings":[],"lastAnalyzed":"${new Date().toISOString()}"}` }],
              response_format: { type: "json_object" },
            });
            const profile = JSON.parse(completion.choices[0]?.message?.content || "{}");
            await storage.updateAiProfile(uid, profile);
            await new Promise(r => setTimeout(r, 500)); // rate limit buffer
          } catch (e) {
            console.error(`Manager analyze failed for user ${uid}:`, e);
          }
        }
        console.log(`[AI Manager] Batch analysis complete for ${usersWithMessages.length} users`);
      })();
    } catch (err) {
      console.error("Analyze all error:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });
  // ─── Stripe / Payment routes ─────────────────────────────────────────────────

  app.get("/api/stripe/status", async (req, res) => {
    const connected = await isStripeConnected();
    if (req.session?.role === "owner") {
      try {
        const stats = await storage.getPaymentStats();
        return res.json({ connected, ...stats });
      } catch (err: any) {
        console.error("[Stripe] status error:", err.message);
      }
    }
    res.json({ connected });
  });

  app.get("/api/payments", requireOwner, async (_req, res) => {
    try {
      const allPayments = await storage.getAllPayments();
      res.json(allPayments);
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get("/api/payments/stats", requireOwner, async (_req, res) => {
    try {
      const stats = await storage.getPaymentStats();
      const allPayments = await storage.getAllPayments();
      const recentPayments = allPayments.slice(0, 20);
      res.json({ ...stats, recentPayments });
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.post("/api/stripe/content-checkout", async (req, res) => {
    try {
      const connected = await isStripeConnected();
      if (!connected) return res.status(503).json({ message: "Platby se připravují" });

      const { userId, contentItemId, amount } = req.body;
      if (!userId || !amount) return res.status(400).json({ message: "userId a amount jsou povinné" });

      const parsedAmount = parseInt(amount);
      if (isNaN(parsedAmount) || parsedAmount < 1 || parsedAmount > 50000) {
        return res.status(400).json({ message: "Neplatná částka (1–50000 Kč)" });
      }
      const parsedUserId = parseInt(userId);
      if (isNaN(parsedUserId)) return res.status(400).json({ message: "Neplatné userId" });

      const user = await storage.getUser(parsedUserId);
      if (!user) return res.status(404).json({ message: "Uživatel nenalezen" });

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(user.name, { userId: String(user.id) });
        customerId = customer.id;
        await storage.updateStripeCustomerId(user.id, customerId);
      }

      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'czk',
            product_data: {
              name: contentItemId ? `Exkluzivní obsah #${contentItemId}` : 'Exkluzivní obsah od Ninna Ray',
              description: 'Odemkni privátní obsah přímo v chatu 💋',
            },
            unit_amount: parsedAmount * 100,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/chat`,
        metadata: {
          userId: String(parsedUserId),
          contentItemId: contentItemId ? String(contentItemId) : '',
          type: 'content_purchase',
        },
      });

      const payment = await storage.createPayment({
        userId: parsedUserId,
        contentItemId: contentItemId ? parseInt(contentItemId) : null,
        amount: parsedAmount * 100,
        currency: 'czk',
        status: 'pending',
        stripeSessionId: session.id,
        stripePaymentIntentId: null,
        type: 'content',
      });

      await storage.addManagerLog("payment_created", `Platba #${payment.id} vytvořena pro uživatele #${parsedUserId}, částka ${parsedAmount} Kč`);

      res.json({ url: session.url, paymentId: payment.id });
    } catch (err: any) {
      console.error("[Stripe] content-checkout error:", err.message);
      await storage.addManagerLog("payment_error", `Chyba při vytváření platby: ${err.message}`);
      res.status(500).json({ message: "Chyba při vytváření platby" });
    }
  });

  app.get("/api/stripe/products", async (_req, res) => {
    try {
      const connected = await isStripeConnected();
      if (!connected) return res.json({ products: [], connected: false });
      const products = await stripeService.listProductsWithPrices();
      res.json({ products, connected: true });
    } catch (err: any) {
      console.error("[Stripe] products error:", err.message);
      res.json({ products: [], connected: false, error: err.message });
    }
  });

  app.post("/api/stripe/checkout", async (req, res) => {
    try {
      const connected = await isStripeConnected();
      if (!connected) return res.status(503).json({ message: "Platby nejsou aktivní" });

      const { priceId, userId } = req.body;
      if (!priceId || !userId) return res.status(400).json({ message: "priceId a userId jsou povinné" });
      if (typeof priceId !== "string" || !priceId.startsWith("price_")) return res.status(400).json({ message: "Neplatný formát priceId" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Uživatel nenalezen" });

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(user.name, { userId: String(user.id), chatCode: user.chatCode || '' });
        customerId = customer.id;
        await storage.updateStripeCustomerId(user.id, customerId);
      }

      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();
      const price = await stripe.prices.retrieve(priceId);
      const mode = price.recurring ? "subscription" : "payment";

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripeService.createCheckoutSession(
        customerId,
        priceId,
        `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        `${baseUrl}/payment/cancel`,
        mode
      );

      res.json({ url: session.url });
    } catch (err: any) {
      console.error("[Stripe] checkout error:", err.message);
      res.status(500).json({ message: "Chyba při vytváření platby" });
    }
  });

  app.get("/api/stripe/subscription/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ message: "Invalid userId" });

      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) return res.json({ subscription: null });

      const connected = await isStripeConnected();
      if (!connected) return res.json({ subscription: null });

      const subscription = await stripeService.getCustomerSubscriptions(user.stripeCustomerId);
      res.json({ subscription });
    } catch (err: any) {
      console.error("[Stripe] subscription error:", err.message);
      res.json({ subscription: null });
    }
  });

  app.post("/api/stripe/portal", requireOwner, async (req, res) => {
    try {
      const connected = await isStripeConnected();
      if (!connected) return res.status(503).json({ message: "Stripe není propojený" });

      const { customerId } = req.body;
      if (!customerId) return res.status(400).json({ message: "customerId je povinné" });

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const portalSession = await stripeService.createCustomerPortalSession(customerId, `${baseUrl}/manager`);
      res.json({ url: portalSession.url });
    } catch (err: any) {
      console.error("[Stripe] portal error:", err.message);
      res.status(500).json({ message: "Chyba při otevírání portálu" });
    }
  });

  return httpServer;
}
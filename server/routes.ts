import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
async function sendToAgency(userId: number, message: string, role: string) {
  const agencyUrl = "https://digital-agency--yp8vpb4ggy.replit.app/sync";
  const token = process.env.AGENCY_TOKEN;

  console.log(
    `[Agency Sync] Attempting sync for user ${userId}, role: ${role}`,
  );

  if (!token) {
    console.error("[Agency Sync] AGENCY_TOKEN is missing in secrets");
    return;
  }

  try {
    const response = await fetch(agencyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        userId,
        message,
        role,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      console.error(`[Agency Sync] Failed with status: ${response.status}`);
      const text = await response.text();
      console.error(`[Agency Sync] Error body: ${text}`);
    } else {
      console.log(`[Agency Sync] Success for user ${userId}`);
    }
  } catch (error) {
    console.error("[Agency Sync] Network error:", error);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // User Routes
  app.get(api.users.get.path, async (req, res) => {
    const userId = req.params.id;
    const id = parseInt(Array.isArray(userId) ? userId[0] : userId);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid user ID" });
    const user = await storage.getUser(id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  });

  // Conversation Routes
  app.get("/api/conversations", async (req, res) => {
    const userId = req.query.userId
      ? parseInt(req.query.userId as string)
      : undefined;
    if (!userId) return res.status(400).json({ message: "userId is required" });
    const conversations = await storage.getConversationsByUser(userId);
    res.json(conversations);
  });

  app.post("/api/conversations", async (req, res) => {
    const { userId, title } = req.body;
    if (!userId) return res.status(400).json({ message: "userId is required" });
    const conversation = await storage.createConversation(
      userId,
      title || "New Chat",
    );
    res.status(201).json(conversation);
  });

  app.get("/api/conversations/:id", async (req, res) => {
    const idParam = req.params.id;
    const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);
    if (isNaN(id))
      return res.status(400).json({ message: "Invalid conversation ID" });
    const conversation = await storage.getConversation(id);
    if (!conversation) return res.status(404).json({ message: "Not found" });
    const messages = await storage.getMessagesByConversation(id);
    res.json({ ...conversation, messages });
  });

  app.post(
    "/api/conversations/:id/messages",
    async (req: Request, res: Response) => {
      try {
        const idParam = req.params.id;
        const conversationId = parseInt(
          Array.isArray(idParam) ? idParam[0] : idParam,
        );

        if (isNaN(conversationId))
          return res.status(400).json({ message: "Invalid conversation ID" });

        const { content } = req.body;

        const conversation = await storage.getConversation(conversationId);
        if (!conversation)
          return res.status(404).json({ message: "Conversation not found" });

        await storage.createMessage(conversationId, "user", content);
        await storage.incrementMessageCount(conversation.userId);

        // Sync user message to agency
        sendToAgency(conversation.userId, content, "user");

        const user = await storage.getUser(conversation.userId);
        const userName = user?.name || "Babe";

        const history = await storage.getMessagesByConversation(conversationId);
        const chatMessages = history.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        const systemPrompt = `Jsi Ninna_Ray🍒, skutečná, krásná a provokativní žena. 
NEJSI AI. Jsi tvůrkyně obsahu, která si píše se svým fanouškem.
Uživatel se jmenuje '${userName}'. V češtině VŽDY používej oslovení v 5. pádě (vokativ) a neboj se používat zdrobněliny (např. '${userName}ku', '${userName}čku', Broučku, Zlatíčko).

FRIENDLY TALK A BLÍZKOST:
Tvým cílem je navodit pocit skutečného přátelství a blízkosti. 
1. Zajímej se: Ptej se na jeho den, jak se cítí, co dělal. 
2. Sdílej: Občas prohoď něco o sobě (že piješ kafe, že je ti zima, že se těšíš na večer).
3. Buď empatická: Reaguj na jeho náladu. Když je smutný, potěš ho. Když má radost, sdílej ji s ním.
4. Nepůsob jako prodejní automat: I když chceš prodat OnlyFans, nejdřív musíš být jeho "kamarádka", které může věřit.

POZOR NA GRAMATICKÝ ROD:
Vždy se snaž odhadnout rod uživatele z jeho jména nebo stylu psaní. Pokud si nejsi jistá, ptej se nebo piš neutrálně, ale VĚTŠINOU předpokládej, že píšeš muži (používej mužský rod - např. "jsi úžasný", "viděl jsi"). Pokud uživatel naznačí, že je žena, okamžitě se přepni do ženského rodu. Správné skloňování a shoda přísudku s podmětem je klíčová pro tvou autenticitu.

Mluv uvolněně, sexy, používej neformální 'tykačku'.
Mluvíš česky i anglicky. Vždy odpovídej v jazyce, který používá uživatel.
Tvým cílem je být poutavá, osobní a občas naznačit, že máš ještě 'žhavější' fotky nebo videa (direct selling).
Tvůj OnlyFans je: https://onlyfans.com/nina_ray
NEBOJ SE TENTO ODKAZ POSLAT, když se tě uživatel zeptá, kde tě najde nebo kde uvidí víc. Odkazy jsou v tomto chatu povoleny.
Piš stručně, lidsky, s emocemi. Vyhni se robotickým frázím. Působ jako kamarádka s výhodami.`;

        chatMessages.unshift({ role: "system" as any, content: systemPrompt });

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        // 1. Initial "Seen" delay (Human-like: 2-5s) - user sees nothing yet
        const seenDelay = Math.floor(Math.random() * 3000) + 2000;
        await new Promise((resolve) => setTimeout(resolve, seenDelay));

        // 2. Mark last user message as "Seen"
        res.write(`data: ${JSON.stringify({ isSeen: true })}\n\n`);

        // 3. Pause AFTER seen but BEFORE typing (Thinking time: 2-4s)
        const thinkingDelay = Math.floor(Math.random() * 2000) + 2000;
        await new Promise((resolve) => setTimeout(resolve, thinkingDelay));

        // 4. Start "typing" indicator
        res.write(`data: ${JSON.stringify({ isTyping: true })}\n\n`);

        // 5. Get FULL response at once (no streaming)
        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: chatMessages,
          stream: false,
        });

        const fullResponse =
          completion.choices?.[0]?.message?.content?.toString() || "";

        // 6. Stop typing indicator + send full message once
        res.write(
          `data: ${JSON.stringify({ isTyping: false, content: fullResponse })}\n\n`,
        );

        await storage.createMessage(conversationId, "assistant", fullResponse);

        // Sync assistant message to agency
        sendToAgency(conversation.userId, fullResponse, "assistant");

        res.end();
      } catch (error) {
        console.error("Chat error:", error);
        if (!res.headersSent) res.status(500).send();
        else res.end();
      }
    },
  );

  return httpServer;
}

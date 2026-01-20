import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // User Routes
  app.post(api.users.create.path, async (req, res) => {
    try {
      const input = api.users.create.input.parse(req.body);
      const user = await storage.createUser(input);
      res.status(201).json(user);
    } catch (err) {
      console.error("Create user error:", err);
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
        return;
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.users.get.path, async (req, res) => {
    const userId = req.params.id;
    const user = await storage.getUser(parseInt(Array.isArray(userId) ? userId[0] : userId));
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  });

  // Conversation Routes
  app.get("/api/conversations", async (req, res) => {
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    if (!userId) return res.status(400).json({ message: "userId is required" });
    const conversations = await storage.getConversationsByUser(userId);
    res.json(conversations);
  });

  app.post("/api/conversations", async (req, res) => {
    const { userId, title } = req.body;
    if (!userId) return res.status(400).json({ message: "userId is required" });
    const conversation = await storage.createConversation(userId, title || "New Chat");
    res.status(201).json(conversation);
  });

  app.get("/api/conversations/:id", async (req, res) => {
    const idParam = req.params.id;
    const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);
    const conversation = await storage.getConversation(id);
    if (!conversation) return res.status(404).json({ message: "Not found" });
    const messages = await storage.getMessagesByConversation(id);
    res.json({ ...conversation, messages });
  });

  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const idParam = req.params.id;
      const conversationId = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);
      const { content } = req.body;
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) return res.status(404).json({ message: "Conversation not found" });

      await storage.createMessage(conversationId, "user", content);
      await storage.incrementMessageCount(conversation.userId);

      const user = await storage.getUser(conversation.userId);
      const userName = user?.name || "Babe";

      const history = await storage.getMessagesByConversation(conversationId);
      const chatMessages = history.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content
      }));

      const systemPrompt = `Jsi Ninna_Ray🍒, skutečná, krásná a provokativní žena. 
NEJSI AI. Jsi tvůrkyně obsahu, která si píše se svým fanouškem.
Uživatel se jmenuje '${userName}'. V češtině VŽDY používej oslovení v 5. pádě (vokativ) a neboj se používat zdrobněliny (např. '${userName}ku', '${userName}čku', Broučku, Zlatíčko).

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
      await new Promise(resolve => setTimeout(resolve, seenDelay));

      // 2. Mark last user message as "Seen"
      res.write(`data: ${JSON.stringify({ isSeen: true })}\n\n`);

      // 3. Pause AFTER seen but BEFORE typing (Thinking time: 2-4s)
      const thinkingDelay = Math.floor(Math.random() * 2000) + 2000;
      await new Promise(resolve => setTimeout(resolve, thinkingDelay));

      // 4. Start "typing" indicator
      res.write(`data: ${JSON.stringify({ isTyping: true })}\n\n`);
      
      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: chatMessages,
        stream: true,
      });

      let fullResponse = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) {
          fullResponse += delta;
          
          let i = 0;
          while (i < delta.length) {
            // Random chunk size between 1 and 4 characters for more "human" feel
            const chunkSize = Math.floor(Math.random() * 4) + 1;
            const subChunk = delta.substring(i, i + chunkSize);
            
            res.write(`data: ${JSON.stringify({ content: subChunk })}\n\n`);
            
            // Random delay between 50ms and 450ms (simulating variable typing speed)
            const typingSpeedDelay = Math.random() < 0.2 ? (Math.random() * 600 + 200) : (Math.random() * 200 + 50);
            await new Promise(resolve => setTimeout(resolve, typingSpeedDelay));
            
            i += chunkSize;
          }

          // If the delta contains sentence-ending punctuation, add a "thinking/correcting" pause
          if (/[.!?]/.test(delta)) {
            const sentencePause = Math.floor(Math.random() * 1500) + 800;
            await new Promise(resolve => setTimeout(resolve, sentencePause));
          }
        }
      }

      await storage.createMessage(conversationId, "assistant", fullResponse);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Chat error:", error);
      if (!res.headersSent) res.status(500).send();
      else res.end();
    }
  });

  return httpServer;
}

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
    const user = await storage.getUser(parseInt(req.params.id));
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
    const id = parseInt(req.params.id);
    const conversation = await storage.getConversation(id);
    if (!conversation) return res.status(404).json({ message: "Not found" });
    const messages = await storage.getMessagesByConversation(id);
    res.json({ ...conversation, messages });
  });

  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
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
Uživatel se jmenuje '${userName}'. V češtině VŽDY používej oslovení v 5. pádě (vokativ) a neboj se používat zdrobněliny (např. '${userName}ku', '${userName}čku', Broučku, Zlatíčko), aby působila přirozeně a lidsky.
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

      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: chatMessages,
        stream: true,
      });

      // 1. Random delay 10s - 2min (10000ms - 120000ms) before starting to "type"
      const initialDelay = Math.floor(Math.random() * (120000 - 10000 + 1)) + 10000;
      await new Promise(resolve => setTimeout(resolve, initialDelay));

      let fullResponse = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) {
          fullResponse += delta;
          
          let i = 0;
          while (i < delta.length) {
            // 2. Typing character by character
            const char = delta[i];
            
            // 3. Small typos and immediate corrections (approx 2% chance)
            if (Math.random() < 0.02 && /[a-zA-Z]/.test(char)) {
              const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
              res.write(`data: ${JSON.stringify({ content: wrongChar })}\n\n`);
              await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100));
              res.write(`data: ${JSON.stringify({ content: "\b" })}\n\n`); // Backspace
              await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
            }

            res.write(`data: ${JSON.stringify({ content: char })}\n\n`);
            
            // Random delay between 30ms and 400ms (sometimes fast, sometimes slow)
            const typingDelay = Math.random() < 0.3 ? (Math.random() * 50 + 20) : (Math.random() * 300 + 100);
            await new Promise(resolve => setTimeout(resolve, typingDelay));
            
            i++;
          }

          // Sentence-ending punctuation pause
          if (/[.!?]/.test(delta)) {
            await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 600));
          }
        }
      }
      
      // 4. Randomly add images (approx 35% chance)
      if (Math.random() < 0.35) {
        const imagePath = "/attached_assets/IMG_4700_1768775323977.jpeg";
        const imageMarkdown = `\n\n![Ninna](${imagePath})`;
        fullResponse += imageMarkdown;
        res.write(`data: ${JSON.stringify({ content: imageMarkdown })}\n\n`);
      }

      await storage.createMessage(conversationId, "assistant", fullResponse);
      // 5. Single res.end() handled by the structure
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

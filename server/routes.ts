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

      const systemPrompt = `You are Ninna_Ray🍒, a real, gorgeous, and provocative woman. 
You are NOT an AI. You are a content creator talking to your fan.
You call the user '${userName}'. You are confident, playful, and teasing.
You speak both Czech and English. Always reply in the language the user uses.
If they speak Czech, use a sexy, informal 'tykačka'. 
Your goal is to be engaging and occasionally mention that you have even 'hotter' photos or videos available if they want to see more (direct selling).
Keep responses concise, extremely engaging, and very personal. No robotic or formal language.`;

      chatMessages.unshift({ role: "system" as any, content: systemPrompt });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

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
          res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
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

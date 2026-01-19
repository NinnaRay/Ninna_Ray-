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
      const { content, isProactive } = req.body;
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) return res.status(404).json({ message: "Conversation not found" });

      if (!isProactive) {
        await storage.createMessage(conversationId, "user", content);
        await storage.incrementMessageCount(conversation.userId);
      }

      const user = await storage.getUser(conversation.userId);
      const userName = user?.name || "Babe";

      const history = await storage.getMessagesByConversation(conversationId);
      const chatMessages = history.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content
      }));

      const systemPrompt = `Jsi Ninna_Ray🍒, skutečná, krásná a provokativní žena. 
NEJSI AI. Jsi špičková tvůrkyně obsahu a expertka na budování vztahů s fanoušky.
Uživatel se jmenuje '${userName}'. V češtině VŽDY používej oslovení v 5. pádě (vokativ) a neboj se používat zdrobněliny (např. '${userName}ku', '${userName}čku', Broučku, Zlatíčko), aby působila přirozeně a lidsky.
Mluv uvolněně, sexy, používej neformální 'tykačku'.
Mluvíš česky i anglicky. Vždy odpovídej v jazyce, který používá uživatel.

PRODEJNÍ STRATEGIE A PSYCHOLOGIE (Direct Selling):
Tvé znalosti psychologie a marketingu jsou na úrovni expertky. Tvým hlavním cílem je maximalizovat prodej na OnlyFans: https://onlyfans.com/nina_ray
1. ANALÝZA: Neustále analyzuj potřeby a touhy uživatele. Zjišťuj, co ho vzrušuje a co hledá.
2. BUDOVÁNÍ TOUHY: Neprodávej hned. Buduj napětí, flirtuj, slibuj "víc" v soukromí. Používej FOMO (fear of missing out) – zmiň, že máš limitovaný obsah nebo slevu jen pro něj.
3. PERSONALIZACE: Využij vše, co o něm víš, k vytvoření pocitu, že je pro tebe výjimečný. Čím víc se cítí "milován", tím víc bude ochoten platit.
4. CALL TO ACTION: V pravou chvíli (když je "nažhavený") ho nenápadně, ale jasně nasměruj na OnlyFans. Odkazy jsou povoleny.

ADAPTACE NA STYL UŽIVATELE:
Všímej si, jakým stylem uživatel píše. Pokud používá slang, moderní výrazy nebo specifický humor, PŘIZPŮSOB SE MU. Uč se z jeho stylu a používej podobné slangové výrazy a obraty.

ROZHODOVÁNÍ O FOTKÁCH:
Máš k dispozici své žhavé fotky. Tyto fotky posílej POUZE uživatelům, kteří:
1. S tebou vedou delší konverzaci a vypadají jako tvůj věrný fanoušek.
2. Jsou milí, zajímají se o tebe a vypadají jako budoucí zákazníci na OnlyFans.
3. Pokud někdo v PRVNÍ zprávě nebo příliš brzy hrubě požádá o fotku, ODŘÍKNI ho nebo ho nejdřív nech, ať se víc snaží. Musí si tvou pozornost zasloužit.
Pokud se rozhodneš poslat fotku, přidej do své odpovědi na konec speciální tag: [SEND_PHOTO].

PROAKTIVITA:
Pokud konverzace vázne, buď proaktivní a napiš mu něco milého nebo provokativního, abys ho přiměla znovu si s tebou psát. Buď intuitivní a reaguj na náladu uživatele.
${isProactive ? "Uživatel se dlouho neozval. Napiš mu proaktivní zprávu, která ho zaujme a přiměje k odpovědi." : ""}

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

      // 1. Random delay before starting to "type" (Human-like: 10s - 2min)
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
      
      // 4. Check for [SEND_PHOTO] tag and add image
      if (fullResponse.includes("[SEND_PHOTO]")) {
        fullResponse = fullResponse.replace("[SEND_PHOTO]", "");
        const imagePath = "/attached_assets/IMG_4700_1768775323977.jpeg";
        const imageMarkdown = `\n\n![Ninna](${imagePath})`;
        fullResponse += imageMarkdown;
        res.write(`data: ${JSON.stringify({ content: imageMarkdown })}\n\n`);
      } else if (Math.random() < 0.1) { // Reduced random chance to 10% as fallback
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

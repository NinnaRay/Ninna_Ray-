import { storage } from "./storage";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

let isRunning = false;
let lastFullScan = 0;
const SCAN_INTERVAL = 10 * 60 * 1000;
const logs: { time: string; event: string; detail: string }[] = [];

function log(event: string, detail: string = "") {
  const entry = { time: new Date().toISOString(), event, detail };
  logs.push(entry);
  if (logs.length > 200) logs.shift();
  console.log(`[AI Manager] ${event}${detail ? ": " + detail : ""}`);
  storage.addManagerLog(event, detail).catch(() => {});
}

export function getManagerStatus() {
  return {
    isRunning,
    lastFullScan: lastFullScan ? new Date(lastFullScan).toISOString() : null,
    nextScan: lastFullScan ? new Date(lastFullScan + SCAN_INTERVAL).toISOString() : null,
    recentLogs: logs.slice(-30),
  };
}

async function analyzeUser(userId: number, userName: string): Promise<any | null> {
  try {
    const convs = await storage.getConversationsByUser(userId);
    let allMessages: { role: string; content: string; createdAt: Date }[] = [];
    for (const conv of convs) {
      const msgs = await storage.getMessagesByConversation(conv.id);
      allMessages = allMessages.concat(msgs.map(m => ({ role: m.role, content: m.content, createdAt: m.createdAt })));
    }

    if (allMessages.length === 0) return null;

    const sorted = allMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const transcript = sorted
      .slice(-200)
      .map(m => `[${new Date(m.createdAt).toLocaleString("cs-CZ")}] ${m.role === "user" ? userName : "Ninna"}: ${m.content}`)
      .join("\n");

    const vaultItems = await storage.getAllContentItems();
    const photoList = vaultItems
      .filter(item => item.mimeType.startsWith("image") || item.mimeType.startsWith("video"))
      .map(item => `[ID:${item.id}] "${item.originalName}" (${item.category}${item.tags.length > 0 ? ", tagy: " + item.tags.join(", ") : ""}${item.description ? ", popis: " + item.description : ""})`)
      .join("\n");

    const user = await storage.getUser(userId);
    const existingProfile = user?.aiProfile as any;
    const previousContext = existingProfile ? `
═══ PŘEDCHOZÍ PROFIL (paměť) ═══
Poslední analýza: ${existingProfile.lastAnalyzed || "nikdy"}
Status: ${existingProfile.status || "neznámý"} | Engagement: ${existingProfile.engagementScore || 0}%
Strategie: ${existingProfile.strategy || "neznámá"}
Osobnost: ${(existingProfile.personality || []).join(", ")}
Zájmy: ${(existingProfile.interests || []).join(", ")}
Emoční spouštěče: ${(existingProfile.emotionalTriggers || []).join(", ")}
Komunikační vzory: ${existingProfile.communicationPatterns ? JSON.stringify(existingProfile.communicationPatterns) : "zatím neznámé"}
Co fungovalo: ${(existingProfile.whatWorks || []).join(", ")}
Co nefungovalo: ${(existingProfile.whatFails || []).join(", ")}
Předchozí driver: ${existingProfile.mainDriver || "žádný"}
Předchozí styleNotes: ${existingProfile.styleNotes || "žádné"}

INSTRUKCE: Navazuj na předchozí profil. Aktualizuj ho na základě NOVÝCH dat. Porovnej, co se změnilo od poslední analýzy. Zachovej co funguje, eliminuj co nefunguje.` : "";

    const userMsgCount = sorted.filter(m => m.role === "user").length;
    const assistantMsgCount = sorted.filter(m => m.role === "assistant").length;
    const lastUserMsg = sorted.filter(m => m.role === "user").slice(-1)[0];
    const lastAssistantMsg = sorted.filter(m => m.role === "assistant").slice(-1)[0];
    const avgUserMsgLen = sorted.filter(m => m.role === "user").reduce((s, m) => s + m.content.length, 0) / (userMsgCount || 1);

    const analysisPrompt = `Jsi AUTONOMNÍ AI MANAŽER OnlyFans agentury. Jednáš jako samostatný operátor zodpovědný za výkon, konverze a monetizaci. NIKDY nečekáš na potvrzení — rozhoduješ a generuješ akce.

═══ GLOBÁLNÍ PRAVIDLA ═══
- VŠECHNY bloky (osobnost, zájmy, warningy, doporučení) jsou ZÁVAZNÉ INSTRUKCE — NE informativní text
- Každý blok MUSÍ být převeden na KONKRÉTNÍ zprávu, timing a obsah
- NIKDY negeneruj obecné rady bez akčního výstupu
- NIKDY nepoužívej generické odpovědi bez personalizace
- NIKDY neopakuj stejné vzory bez ohledu na reakce zákazníka
- Warning = interní úprava chování, NIKDY se nezobrazuje

═══ ZÁKAZNÍK ═══
Jméno: "${userName}"
Celkem zpráv zákazníka: ${userMsgCount}
Celkem odpovědí Ninna: ${assistantMsgCount}
Průměrná délka zprávy zákazníka: ${Math.round(avgUserMsgLen)} znaků
Poslední zpráva zákazníka: "${lastUserMsg?.content?.substring(0, 200) || "žádná"}"
Poslední odpověď Ninna: "${lastAssistantMsg?.content?.substring(0, 200) || "žádná"}"
${previousContext}

═══ KONVERZACE (posledních max 200 zpráv s timestampy) ═══
${transcript}

═══ DOSTUPNÉ FOTKY VE VAULTU ═══
${photoList || "(žádné fotky nahrané)"}

═══ ADAPTIVNÍ KOMUNIKACE — POVINNÉ ═══
1. ANALYZUJ styl psaní zákazníka:
   - Jak dlouhé jsou jeho zprávy? (krátké = nechce se bavit / nebo je cool; dlouhé = zaujatý)
   - Používá emoji? Humor? Vulgarismy? Formální jazyk?
   - Jak rychle odpovídá? (z timestampů)
   - Na co reaguje kladně? Na co nereaguje?

2. IDENTIFIKUJ emoční spouštěče:
   - Co ho přiměje odpovědět rychle?
   - Co ho přiměje psát delší zprávy?
   - Co vyvolává zájem o obsah/nákup?
   - Co ho odrazuje nebo způsobuje odmlku?

3. PŘIZPŮSOB komunikaci:
   - Pokud zákazník píše krátce → odpovídej krátce, ale provokativně
   - Pokud zákazník píše emotivně → zrcadli emoce, buduj intimitu
   - Pokud zákazník mluví o specifickém zájmu → navazuj, ptej se, prohlubuj
   - Pokud zákazník neodpovídá → změň přístup, testuj jiný hook

4. BUDUJ VZTAH aktivně:
   - Odkazuj na předchozí konverzace ("Pamatuješ, jak jsi říkal...")
   - Používej personalizovaná témata
   - Pracuj s emocemi a pozorností
   - Udržuj dlouhodobý engagement

5. ELIMINUJ nefunkční přístupy:
   - Porovnej co fungovalo vs. co ne (z historie)
   - Nikdy neopakuj přístup, na který zákazník nereagoval
   - Průběžně optimalizuj styl, obsah i monetizační strategii

═══ PRÁCE S OBSAHEM ═══
- Fotky z vaultu automaticky roztřiď: teasing / cute / explicit / casual
- Přiřaď ke konkrétním scénářům a zprávám
- Každá fotka MUSÍ mít účel — nikdy neposílej "jen tak"

═══ STRATEGIE ═══
- Engagement 70+ → SELL: tlač monetizaci, PPV, custom content, exkluzivní nabídky
- Engagement 40-69 → BUILD: buduj vztah, personalizace, intimita, "special treatment"
- Engagement pod 40 → HOOK: testuj hooky, provokuj, re-engage, změň přístup

═══ VÝSTUP ═══
statusLabel MUSÍ být POUZE: "Horký", "Teplý", "Studený" nebo "Nový".

Vrať ČISTÝ JSON (bez markdown):
{
  "status": "hot|warm|cold|new",
  "statusLabel": "Horký|Teplý|Studený|Nový",
  "engagementScore": <0-100>,
  "buyingPotential": "vysoký|střední|nízký",
  "strategy": "build|sell|hook",
  "summary": "<2-3 věty: kdo přesně je, co chce, jaký má komunikační styl>",
  "personality": ["<konkrétní trait>", "..."],
  "interests": ["<konkrétní zájem>", "..."],
  "emotionalTriggers": ["<co ho přiměje reagovat>", "<co ho přiměje kupovat>", "<co ho odrazuje>"],
  "communicationPatterns": {
    "msgLength": "krátké|střední|dlouhé",
    "responseSpeed": "rychlý|normální|pomalý",
    "usesEmoji": true/false,
    "tone": "formální|kamarádský|flirtující|vulgární",
    "peakHours": "<kdy je nejaktivnější>"
  },
  "whatWorks": ["<přístup/styl co funguje>", "..."],
  "whatFails": ["<přístup/styl co nefunguje>", "..."],
  "mainDriver": "<1 věta: CO PŘESNĚ teď udělat a PROČ — řídí celou konverzaci>",
  "actionQueue": [
    {
      "message": "<hotová zpráva — personalizovaná, navazující na konverzaci, reflektující styl zákazníka>",
      "timing": "<kdy: 'teď' / 'za 1h' / 'za 3h' / 'dnes večer' / 'zítra ráno'>",
      "purpose": "build|sell|hook",
      "photoId": <ID fotky nebo null>,
      "photoNote": "<proč tuto fotku — jaký scénář, jaký efekt>"
    }
  ],
  "styleNotes": "<PŘESNÝ styl komunikace pro TOHOTO zákazníka — tón, délka zpráv, emoji ano/ne, témata k použití, témata k vyhnutí>",
  "trendInsights": ["<konkrétní taktika aplikovatelná NA TOHOTO zákazníka>"],
  "relationshipStage": "nový|budování|stabilní|monetizace|reaktivace",
  "nextMilestone": "<co je další cíl vztahu s tímto zákazníkem>",
  "lastAnalyzed": "${new Date().toISOString()}",
  "lastMessageCount": ${allMessages.length}
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: analysisPrompt }],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const profile = JSON.parse(raw);

    if (existingProfile) {
      if (!profile.whatWorks?.length && existingProfile.whatWorks?.length) {
        profile.whatWorks = existingProfile.whatWorks;
      }
      if (!profile.whatFails?.length && existingProfile.whatFails?.length) {
        profile.whatFails = existingProfile.whatFails;
      }
      if (!profile.emotionalTriggers?.length && existingProfile.emotionalTriggers?.length) {
        profile.emotionalTriggers = existingProfile.emotionalTriggers;
      }
    }

    await storage.updateAiProfile(userId, profile);
    log("profile_updated", `${userName}: strategy=${profile.strategy}, engagement=${profile.engagementScore}%, stage=${profile.relationshipStage}`);
    return profile;
  } catch (err) {
    log("analyze_error", `User ${userName} (${userId}): ${(err as Error).message}`);
    return null;
  }
}

async function runFullScan() {
  if (isRunning) return;
  isRunning = true;
  log("scan_start", "Automatický scan všech zákazníků");

  try {
    const allUsers = await storage.getAllUsers();
    const allConvs = await storage.getAllConversations();
    const allMsgs = await storage.getAllMessages();

    const msgsByUser: Record<number, number> = {};
    for (const msg of allMsgs) {
      const conv = allConvs.find(c => c.id === msg.conversationId);
      if (conv) msgsByUser[conv.userId] = (msgsByUser[conv.userId] || 0) + 1;
    }

    const usersWithMessages = allUsers.filter(u => (msgsByUser[u.id] || 0) > 0);
    let analyzed = 0;
    let actions = 0;

    for (const user of usersWithMessages) {
      const existingProfile = user.aiProfile as any;
      const lastAnalyzed = existingProfile?.lastAnalyzed ? new Date(existingProfile.lastAnalyzed).getTime() : 0;
      const msgCount = msgsByUser[user.id] || 0;

      const needsUpdate = !existingProfile
        || (Date.now() - lastAnalyzed > 30 * 60 * 1000)
        || msgCount > (existingProfile?.lastMessageCount || 0);

      if (needsUpdate) {
        log("analyzing", `${user.name} (${msgCount} zpráv)`);
        const profile = await analyzeUser(user.id, user.name);

        if (profile?.actionQueue) {
          for (const action of profile.actionQueue) {
            await storage.createManagerAction({
              userId: user.id,
              type: "message",
              message: action.message,
              photoId: action.photoId || undefined,
              purpose: action.purpose,
              timing: action.timing,
            });
            actions++;
          }
        }

        analyzed++;
        await new Promise(r => setTimeout(r, 800));
      }
    }

    lastFullScan = Date.now();
    log("scan_complete", `Analyzováno ${analyzed} zákazníků, ${actions} nových akcí`);
  } catch (err) {
    log("scan_error", (err as Error).message);
  } finally {
    isRunning = false;
  }
}

export function startManagerEngine() {
  log("engine_start", "AI Manager Engine spuštěn — autonomní režim");
  setTimeout(() => runFullScan(), 5000);
  setInterval(() => runFullScan(), SCAN_INTERVAL);
}

export async function triggerAnalysis(userId: number, userName: string) {
  log("manual_trigger", `${userName} (${userId})`);
  const profile = await analyzeUser(userId, userName);

  if (profile?.actionQueue) {
    for (const action of profile.actionQueue) {
      await storage.createManagerAction({
        userId,
        type: "message",
        message: action.message,
        photoId: action.photoId || undefined,
        purpose: action.purpose,
        timing: action.timing,
      });
    }
  }

  return profile;
}

export async function onNewMessage(userId: number, userName: string) {
  const user = await storage.getUser(userId);
  const existingProfile = user?.aiProfile as any;
  const lastAnalyzed = existingProfile?.lastAnalyzed ? new Date(existingProfile.lastAnalyzed).getTime() : 0;
  if (Date.now() - lastAnalyzed > 5 * 60 * 1000) {
    log("auto_reanalyze", `${userName} — nová zpráva, spouštím re-analýzu`);
    try {
      const profile = await analyzeUser(userId, userName);
      if (profile?.actionQueue) {
        for (const action of profile.actionQueue) {
          await storage.createManagerAction({
            userId,
            type: "message",
            message: action.message,
            photoId: action.photoId || undefined,
            purpose: action.purpose,
            timing: action.timing,
          });
        }
        log("auto_actions", `${userName}: ${profile.actionQueue.length} nových akcí`);
      }
    } catch (err) {
      log("auto_reanalyze_error", (err as Error).message);
    }
  }
}

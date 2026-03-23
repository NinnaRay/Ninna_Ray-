import { storage } from "./storage";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

let isRunning = false;
let enginePaused = true;
let lastFullScan = 0;
const SCAN_INTERVAL = 10 * 60 * 1000;
const DELAYED_QUEUE: { actionId: number; userId: number; message: string; photoId?: number; executeAt: number }[] = [];
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
    isPaused: enginePaused,
    lastFullScan: lastFullScan ? new Date(lastFullScan).toISOString() : null,
    nextScan: lastFullScan ? new Date(lastFullScan + SCAN_INTERVAL).toISOString() : null,
    recentLogs: logs.slice(-50),
    pendingDelayed: DELAYED_QUEUE.length,
    autonomousFeatures: {
      autoCleanup: !enginePaused,
      selfLearning: !enginePaused,
      autoMessaging: !enginePaused,
      duplicateDetection: !enginePaused,
    },
  };
}

export function setEnginePaused(paused: boolean) {
  enginePaused = paused;
  log(paused ? "engine_paused" : "engine_resumed", paused ? "Owner pozastavil engine" : "Owner obnovil engine");
  if (!paused) {
    setTimeout(() => autoCleanup(), 1000);
    setTimeout(() => executePendingBacklog(), 3000);
    setTimeout(() => selfLearn(), 4000);
    setTimeout(() => runFullScan(), 6000);
  }
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

function parseTimingToMs(timing: string): number {
  if (!timing || timing === "teď" || timing === "hned") return 0;
  const match = timing.match(/za\s*(\d+)\s*(h|min|m)/i);
  if (match) {
    const val = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === "h") return val * 60 * 60 * 1000;
    return val * 60 * 1000;
  }
  if (timing.includes("večer")) return 4 * 60 * 60 * 1000;
  if (timing.includes("zítra")) return 12 * 60 * 60 * 1000;
  return 0;
}

async function executeAction(actionId: number, userId: number, message: string, photoId?: number): Promise<boolean> {
  try {
    if (enginePaused) {
      log("exec_skipped", `Action #${actionId} — engine pozastaven`);
      return false;
    }

    const convs = await storage.getConversationsByUser(userId);
    if (convs.length === 0) {
      log("exec_no_conv", `User ${userId} — žádná konverzace, vytvářím novou`);
      const user = await storage.getUser(userId);
      const conv = await storage.createConversation(userId, user?.name || "Chat");
      await storage.createMessage(conv.id, "assistant", message);
    } else {
      const latestConv = convs[0];
      await storage.createMessage(latestConv.id, "assistant", message);
    }

    if (photoId) {
      const vaultItem = await storage.getContentItem(photoId);
      if (vaultItem) {
        await storage.incrementContentUsage(photoId);
      }
    }

    await storage.updateManagerAction(actionId, {
      status: "done",
      result: "auto-sent",
      executedAt: new Date(),
    });

    const user = await storage.getUser(userId);
    log("exec_sent", `→ ${user?.name || userId}: "${message.substring(0, 60)}..." ${photoId ? `[fotka #${photoId}]` : ""}`);
    return true;
  } catch (err) {
    log("exec_error", `Action #${actionId}: ${(err as Error).message}`);
    await storage.updateManagerAction(actionId, {
      status: "failed",
      result: (err as Error).message,
    });
    return false;
  }
}

async function processDelayedQueue() {
  if (enginePaused) return;
  const now = Date.now();
  const ready = DELAYED_QUEUE.filter(item => item.executeAt <= now);
  for (const item of ready) {
    const idx = DELAYED_QUEUE.indexOf(item);
    if (idx >= 0) DELAYED_QUEUE.splice(idx, 1);

    const action = (await storage.getManagerActions()).find(a => a.id === item.actionId);
    if (action?.status !== "pending") continue;

    await executeAction(item.actionId, item.userId, item.message, item.photoId);
  }
}

async function scheduleOrExecuteAction(actionId: number, userId: number, message: string, timing: string, photoId?: number) {
  const delayMs = parseTimingToMs(timing);

  if (delayMs === 0) {
    await executeAction(actionId, userId, message, photoId);
  } else {
    DELAYED_QUEUE.push({
      actionId,
      userId,
      message,
      photoId,
      executeAt: Date.now() + delayMs,
    });
    const user = await storage.getUser(userId);
    log("exec_scheduled", `${user?.name || userId}: za ${Math.round(delayMs / 60000)} min — "${message.substring(0, 50)}..."`);
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

        if (profile?.actionQueue && !enginePaused) {
          for (const action of profile.actionQueue) {
            const created = await storage.createManagerAction({
              userId: user.id,
              type: "message",
              message: action.message,
              photoId: action.photoId || undefined,
              purpose: action.purpose,
              timing: action.timing,
            });
            await scheduleOrExecuteAction(created.id, user.id, action.message, action.timing || "teď", action.photoId || undefined);
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

async function executePendingBacklog() {
  try {
    const actions = await storage.getManagerActions();
    const pending = actions.filter(a => a.status === "pending");
    if (pending.length === 0) return;
    log("backlog_start", `${pending.length} starých nevyřízených akcí — spouštím odeslání`);
    let sent = 0;
    for (const action of pending.reverse()) {
      if (enginePaused) { log("backlog_paused", `Pozastaveno po ${sent} akcích`); break; }
      if (!action.message || !action.userId) continue;
      await executeAction(action.id, action.userId, action.message, action.photoId || undefined);
      sent++;
      await new Promise(r => setTimeout(r, 500));
    }
    log("backlog_complete", `Odesláno ${sent}/${pending.length} starých akcí`);
  } catch (err) {
    log("backlog_error", (err as Error).message);
  }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function autoCleanup() {
  if (enginePaused) return;
  try {
    const allUsers = await storage.getAllUsers();
    const allConvs = await storage.getAllConversations();
    const allMsgs = await storage.getAllMessages();

    const msgsByConv: Record<number, number> = {};
    for (const msg of allMsgs) {
      msgsByConv[msg.conversationId] = (msgsByConv[msg.conversationId] || 0) + 1;
    }

    const userMsgCounts: Record<number, number> = {};
    for (const conv of allConvs) {
      userMsgCounts[conv.userId] = (userMsgCounts[conv.userId] || 0) + (msgsByConv[conv.id] || 0);
    }

    const TEST_PATTERNS = /^(test|testuser|testpayer|admin|demo)/i;

    const nameGroups = new Map<string, typeof allUsers>();
    for (const u of allUsers) {
      const key = normalizeName(u.name);
      const arr = nameGroups.get(key) || [];
      arr.push(u);
      nameGroups.set(key, arr);
    }

    let deleted = 0;
    let merged = 0;

    for (const u of allUsers) {
      if (TEST_PATTERNS.test(u.name) && (userMsgCounts[u.id] || 0) === 0) {
        await storage.deleteUser(u.id);
        log("auto_cleanup", `Smazán testovací účet: "${u.name}" #${u.id} (0 zpráv)`);
        deleted++;
      }
    }

    for (const [key, group] of nameGroups) {
      if (group.length <= 1) continue;

      const emptyDuplicates = group.filter(u => (userMsgCounts[u.id] || 0) === 0 && !TEST_PATTERNS.test(u.name));
      const withMessages = group.filter(u => (userMsgCounts[u.id] || 0) > 0);

      if (withMessages.length > 0) {
        for (const empty of emptyDuplicates) {
          await storage.deleteUser(empty.id);
          log("auto_cleanup", `Smazán prázdný duplikát: "${empty.name}" #${empty.id} (originál #${withMessages[0].id} má ${userMsgCounts[withMessages[0].id]} zpráv)`);
          deleted++;
          merged++;
        }
      } else if (emptyDuplicates.length > 1) {
        for (let i = 1; i < emptyDuplicates.length; i++) {
          await storage.deleteUser(emptyDuplicates[i].id);
          log("auto_cleanup", `Smazán nadbytečný duplikát: "${emptyDuplicates[i].name}" #${emptyDuplicates[i].id}`);
          deleted++;
        }
      }
    }

    if (deleted > 0) {
      log("cleanup_complete", `Vyčištěno ${deleted} účtů (${merged} duplikátů sloučeno)`);
    }
  } catch (err) {
    log("cleanup_error", (err as Error).message);
  }
}

async function selfLearn() {
  if (enginePaused) return;
  try {
    const recentActions = await storage.getManagerActions(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const doneActions = recentActions.filter(a => a.status === "done" && a.userId);

    let gotResponse = 0;
    let noResponse = 0;

    for (const action of doneActions.slice(0, 50)) {
      if (!action.executedAt || !action.userId) continue;

      const convs = await storage.getConversationsByUser(action.userId);
      if (convs.length === 0) continue;

      const msgs = await storage.getMessagesByConversation(convs[0].id);
      const actionTime = new Date(action.executedAt).getTime();
      const userReplied = msgs.some(m =>
        m.role === "user" && new Date(m.createdAt).getTime() > actionTime
      );

      if (userReplied) gotResponse++;
      else noResponse++;
    }

    const total = gotResponse + noResponse;
    if (total > 0) {
      const responseRate = Math.round((gotResponse / total) * 100);
      log("self_learn", `Response rate: ${responseRate}% (${gotResponse}/${total} zpráv dostalo odpověď za 24h)`);

      if (responseRate < 20 && total >= 5) {
        log("self_learn_warning", `Nízký response rate (${responseRate}%) — engine upraví strategii při příštím scanu`);
      }
    }
  } catch (err) {
    log("self_learn_error", (err as Error).message);
  }
}

export function startManagerEngine() {
  log("engine_start", "AI Manager Engine spuštěn — POZASTAVENÝ (čeká na spuštění ownerem)");
  setInterval(() => {
    if (!enginePaused) runFullScan();
  }, SCAN_INTERVAL);
  setInterval(() => processDelayedQueue(), 30 * 1000);
  setInterval(() => {
    if (!enginePaused) autoCleanup();
  }, 60 * 60 * 1000);
  setInterval(() => {
    if (!enginePaused) selfLearn();
  }, 30 * 60 * 1000);
}

export async function triggerAnalysis(userId: number, userName: string) {
  log("manual_trigger", `${userName} (${userId})`);
  const profile = await analyzeUser(userId, userName);

  if (profile?.actionQueue && !enginePaused) {
    for (const action of profile.actionQueue) {
      const created = await storage.createManagerAction({
        userId,
        type: "message",
        message: action.message,
        photoId: action.photoId || undefined,
        purpose: action.purpose,
        timing: action.timing,
      });
      await scheduleOrExecuteAction(created.id, userId, action.message, action.timing || "teď", action.photoId || undefined);
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
      if (profile?.actionQueue && !enginePaused) {
        for (const action of profile.actionQueue) {
          const created = await storage.createManagerAction({
            userId,
            type: "message",
            message: action.message,
            photoId: action.photoId || undefined,
            purpose: action.purpose,
            timing: action.timing,
          });
          await scheduleOrExecuteAction(created.id, userId, action.message, action.timing || "teď", action.photoId || undefined);
        }
        log("auto_actions", `${userName}: ${profile.actionQueue.length} nových akcí auto-odesláno`);
      }
    } catch (err) {
      log("auto_reanalyze_error", (err as Error).message);
    }
  }
}

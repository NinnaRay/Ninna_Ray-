import { storage } from "./storage";
import OpenAI from "openai";
import { getMarketContext, getPricingForUser, getMarketIntelligence } from "./market-intelligence";
import { computeEngagementScore, classifyByScore, type EngagementScoreResult } from "./analytics-engine";

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

const messageSendTimes: Record<number, number[]> = {};
const MAX_MESSAGES_PER_HOUR = 3;
const MAX_MESSAGES_PER_DAY = 8;

interface LearningData {
  totalSent: number;
  totalResponded: number;
  responseRate: number;
  bestPurposes: Record<string, { sent: number; responded: number; rate: number }>;
  bestTimings: Record<string, { sent: number; responded: number; rate: number }>;
  avgResponseTime: number;
  lastUpdated: string;
}

let globalLearnings: LearningData = {
  totalSent: 0,
  totalResponded: 0,
  responseRate: 0,
  bestPurposes: {},
  bestTimings: {},
  avgResponseTime: 0,
  lastUpdated: new Date().toISOString(),
};

function canSendToUser(userId: number): boolean {
  const now = Date.now();
  if (!messageSendTimes[userId]) messageSendTimes[userId] = [];
  messageSendTimes[userId] = messageSendTimes[userId].filter(t => now - t < 24 * 60 * 60 * 1000);

  const hourAgo = now - 60 * 60 * 1000;
  const msgsLastHour = messageSendTimes[userId].filter(t => t > hourAgo).length;
  const msgsLast24h = messageSendTimes[userId].length;

  if (msgsLastHour >= MAX_MESSAGES_PER_HOUR) return false;
  if (msgsLast24h >= MAX_MESSAGES_PER_DAY) return false;
  return true;
}

function recordSend(userId: number) {
  if (!messageSendTimes[userId]) messageSendTimes[userId] = [];
  messageSendTimes[userId].push(Date.now());
}

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
      antiSpam: !enginePaused,
      revenueOptimization: !enginePaused,
      perUserMemory: !enginePaused,
      behavioralScoring: !enginePaused,
      scoreDecay: !enginePaused,
    },
    scoringFormula: "CES = (2×messages) + (4×content_views) + (5×purchases) - (3×days_inactive) × 0.9^weeks_inactive",
    scoreThresholds: { cold: "<25", warm: "25-49", hot: "50-79", monetized: "80+" },
    learnings: globalLearnings,
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

const MARKET_BENCHMARKS_REF = {
  optimalFirst: { min: 39, max: 79 },
};

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
Cenová citlivost: ${existingProfile.priceSensitivity || "neznámá"}
Preferovaný prodejní styl: ${existingProfile.sellStyle || "neznámý"}

INSTRUKCE: Navazuj na předchozí profil. Aktualizuj ho na základě NOVÝCH dat. Porovnej, co se změnilo od poslední analýzy. Zachovej co funguje, eliminuj co nefunguje.` : "";

    const userPayments = await storage.getPaymentsByUser(userId);
    const completedPayments = userPayments.filter(p => p.status === "completed");
    const failedPayments = userPayments.filter(p => p.status === "failed");
    const totalSpent = completedPayments.reduce((s, p) => s + p.amount, 0) / 100;
    const avgPayment = completedPayments.length > 0 ? Math.round(totalSpent / completedPayments.length) : 0;
    const lastPurchase = completedPayments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const daysSinceLastPurchase = lastPurchase ? Math.round((Date.now() - new Date(lastPurchase.createdAt).getTime()) / (24 * 60 * 60 * 1000)) : -1;

    const purchaseContext = userPayments.length > 0 ? `
═══ PLATEBNÍ HISTORIE ZÁKAZNÍKA ═══
Celkem plateb: ${completedPayments.length} úspěšných, ${failedPayments.length} neúspěšných
Celkem utraceno: ${totalSpent} Kč
Průměrná platba: ${avgPayment} Kč
Poslední nákup: ${lastPurchase ? `${daysSinceLastPurchase} dní zpátky (${lastPurchase.amount / 100} Kč)` : "nikdy"}
Cenový rozsah: ${completedPayments.length > 0 ? `${Math.min(...completedPayments.map(p => p.amount)) / 100}–${Math.max(...completedPayments.map(p => p.amount)) / 100} Kč` : "neznámý"}
` : `
═══ PLATEBNÍ HISTORIE ZÁKAZNÍKA ═══
Zatím žádné nákupy.
`;

    const learningContext = globalLearnings.totalSent > 0 ? `
═══ GLOBÁLNÍ LEARNING DATA (self-improving) ═══
Celkový response rate: ${globalLearnings.responseRate}% (${globalLearnings.totalResponded}/${globalLearnings.totalSent})
Průměrný čas odpovědi: ${globalLearnings.avgResponseTime} min
Nejlepší typy zpráv: ${Object.entries(globalLearnings.bestPurposes).sort((a, b) => b[1].rate - a[1].rate).map(([k, v]) => `${k}=${v.rate}%`).join(", ")}
Nejlepší timing: ${Object.entries(globalLearnings.bestTimings).sort((a, b) => b[1].rate - a[1].rate).map(([k, v]) => `${k}=${v.rate}%`).join(", ")}
INSTRUKCE: Používej typy zpráv s vysokým response rate. Vyhni se typům s nízkým rate. Přizpůsob timing podle dat.
` : "";

    const userMsgCount = sorted.filter(m => m.role === "user").length;
    const assistantMsgCount = sorted.filter(m => m.role === "assistant").length;
    const lastUserMsg = sorted.filter(m => m.role === "user").slice(-1)[0];
    const lastAssistantMsg = sorted.filter(m => m.role === "assistant").slice(-1)[0];
    const avgUserMsgLen = sorted.filter(m => m.role === "user").reduce((s, m) => s + m.content.length, 0) / (userMsgCount || 1);

    const timeSinceLastUserMsg = lastUserMsg ? Math.round((Date.now() - new Date(lastUserMsg.createdAt).getTime()) / (60 * 60 * 1000)) : 0;

    const analysisPrompt = `Jsi AUTONOMNÍ AI MANAŽER digitální agentury Ninna Ray. Jednáš jako samostatný operátor zodpovědný za výkon, konverze a monetizaci PŘÍMO V APLIKACI přes Stripe. NIKDY nečekáš na potvrzení — rozhoduješ a generuješ akce.
NIKDY neodkazuj na OnlyFans ani žádné externí platformy. Veškerá monetizace probíhá IN-APP přes Stripe (obsah se odemyká přímo v chatu).

═══ GLOBÁLNÍ PRAVIDLA ═══
- VŠECHNY bloky (osobnost, zájmy, warningy, doporučení) jsou ZÁVAZNÉ INSTRUKCE — NE informativní text
- Každý blok MUSÍ být převeden na KONKRÉTNÍ zprávu, timing a obsah
- NIKDY negeneruj obecné rady bez akčního výstupu
- NIKDY nepoužívej generické odpovědi bez personalizace
- NIKDY neopakuj stejné vzory bez ohledu na reakce zákazníka
- Warning = interní úprava chování, NIKDY se nezobrazuje
- ANTI-SPAM: Generuj max 2-3 akce na zákazníka za scan. NIKDY nezahltí zákazníka zprávami.

═══ ZÁKAZNÍK ═══
Jméno: "${userName}"
Celkem zpráv zákazníka: ${userMsgCount}
Celkem odpovědí Ninna: ${assistantMsgCount}
Průměrná délka zprávy zákazníka: ${Math.round(avgUserMsgLen)} znaků
Poslední zpráva zákazníka: "${lastUserMsg?.content?.substring(0, 200) || "žádná"}" (před ${timeSinceLastUserMsg}h)
Poslední odpověď Ninna: "${lastAssistantMsg?.content?.substring(0, 200) || "žádná"}"
${previousContext}
${purchaseContext}
${learningContext}

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

═══ REVENUE OPTIMIZATION (DATA-DRIVEN — ŽÁDNÉ NÁHODNÉ CENY) ═══
${getMarketContext()}

INTERNÍ DATA TOHOTO ZÁKAZNÍKA:
- Celkem utraceno: ${totalSpent} Kč | Počet nákupů: ${completedPayments.length} | Průměrná platba: ${avgPayment} Kč
- Cenový rozsah nákupů: ${completedPayments.length > 0 ? `${Math.min(...completedPayments.map(p => p.amount)) / 100}-${Math.max(...completedPayments.map(p => p.amount)) / 100} Kč` : "žádné"}
- Cenová citlivost: ${existingProfile?.priceSensitivity || "neznámá"}

PRAVIDLA PRO CENU suggestedPrice:
1. NIKDY nevymýšlej cenu z hlavy — VŽDY použij tržní tiers + historii zákazníka
2. První nákup → použij "Entry" tier (${MARKET_BENCHMARKS_REF.optimalFirst.min}-${MARKET_BENCHMARKS_REF.optimalFirst.max} Kč)
3. Opakovaný nákup → cena = průměr předchozích nákupů * 1.05-1.15 (v rámci odpovídajícího tieru)
4. Vysoká cenová citlivost → -15% z vypočtené ceny
5. Nízká cenová citlivost → +10% z vypočtené ceny
6. Pokud nemáš dost dat → suggestedPrice = 0 (nenavrhuj cenu)

- A/B PŘÍSTUP: ${existingProfile?.sellStyle === "direct" ? "Zkus tentokrát NEPŘÍMÝ přístup (tease, curiosity gap)." : existingProfile?.sellStyle === "indirect" ? "Zkus tentokrát PŘÍMÝ přístup (jasná nabídka, urgency)." : "Testuj oba přístupy — zapiš co funguje do sellStyle."}
- PRESSURE CALIBRACE: ${timeSinceLastUserMsg > 48 ? "Zákazník je NEAKTIVNÍ — nulový prodejní tlak, pouze re-engage hook." : timeSinceLastUserMsg > 12 ? "Zákazník je ODMLČENÝ — jemný hook, žádný prodej." : daysSinceLastPurchase > 7 || daysSinceLastPurchase === -1 ? "Zákazník nekoupil nedávno — buduj vztah a teprve pak nabídni." : "Zákazník je AKTIVNÍ kupce — timing pro další nabídku."}

═══ STRATEGIE (monetizace POUZE přes Stripe v aplikaci) ═══
- Engagement 70+ → SELL: nabídni placený obsah přímo v chatu (fotky/videa za Stripe platbu), tease → zájem → nabídka → Stripe payment → unlock
- Engagement 40-69 → BUILD: buduj vztah, personalizace, intimita, "special treatment", ŽÁDNÝ prodej
- Engagement pod 40 → HOOK: testuj hooky, provokuj, re-engage, změň přístup, ŽÁDNÝ prodej
- NIKDY neodkazuj na externí platformy (OnlyFans, Fansly atd.) — vše probíhá v aplikaci

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
      "message": "<hotová zpráva — personalizovaná, navazující na konverzaci, reflektující styl zákazníka. NIKDY nepřidávej platební link do zprávy — systém ho vygeneruje automaticky.>",
      "timing": "<kdy: 'teď' / 'za 1h' / 'za 3h' / 'dnes večer' / 'zítra ráno'>",
      "purpose": "build|sell|hook",
      "photoId": <ID fotky nebo null — pokud purpose=sell, VŽDY vyber konkrétní fotku z dostupných>,
      "photoNote": "<proč tuto fotku — jaký scénář, jaký efekt>",
      "price": <cena v CZK (celé číslo) pokud purpose=sell, jinak 0. Použij tržní benchmarky: fotka 49-149, video 99-299, premium set 199-499. NIKDY pod 29 Kč.>
    }
  ],
  "styleNotes": "<PŘESNÝ styl komunikace pro TOHOTO zákazníka — tón, délka zpráv, emoji ano/ne, témata k použití, témata k vyhnutí>",
  "trendInsights": ["<konkrétní taktika aplikovatelná NA TOHOTO zákazníka>"],
  "relationshipStage": "nový|budování|stabilní|monetizace|reaktivace",
  "nextMilestone": "<co je další cíl vztahu s tímto zákazníkem>",
  "priceSensitivity": "nízká|střední|vysoká|neznámá",
  "sellStyle": "direct|indirect|tease|neznámý",
  "suggestedPrice": <doporučená cena v CZK pro další nabídku, nebo 0 pokud zatím nenabízet>,
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
      if (profile.priceSensitivity === "neznámá" && existingProfile.priceSensitivity && existingProfile.priceSensitivity !== "neznámá") {
        profile.priceSensitivity = existingProfile.priceSensitivity;
      }
      if ((!profile.sellStyle || profile.sellStyle === "neznámý") && existingProfile.sellStyle && existingProfile.sellStyle !== "neznámý") {
        profile.sellStyle = existingProfile.sellStyle;
      }
    }

    try {
      const pricingResult = await getPricingForUser(userId, undefined);
      if (pricingResult.confidence !== "none") {
        profile.suggestedPrice = pricingResult.suggestedPrice;
        profile._pricingSource = "engine";
        profile._pricingConfidence = pricingResult.confidence;
        profile._pricingRange = pricingResult.priceRange;
        profile._pricingTier = pricingResult.tier;
        profile._pricingReasoning = pricingResult.reasoning;
      }
    } catch (e) {
      console.error("[AI Manager] pricing engine fallback:", e);
    }

    try {
      const cesResult = await computeEngagementScore(userId);
      profile.engagementScore = cesResult.decayedScore;
      profile._cesRawScore = cesResult.rawScore;
      profile._cesClassification = cesResult.classification;
      profile._cesClassificationLabel = cesResult.classificationLabel;
      profile._cesComponents = cesResult.components;
      profile._cesDaysInactive = cesResult.daysInactive;
      profile._cesWeeksSinceLastActivity = cesResult.weeksSinceLastActivity;

      const { classification } = classifyByScore(cesResult.decayedScore);
      if (classification === "monetized") {
        profile.status = "hot";
        profile.statusLabel = "Horký";
      } else if (classification === "hot") {
        profile.status = "hot";
        profile.statusLabel = "Horký";
      } else if (classification === "warm") {
        profile.status = "warm";
        profile.statusLabel = "Teplý";
      } else {
        profile.status = "cold";
        profile.statusLabel = "Studený";
      }
    } catch (e) {
      console.error("[AI Manager] CES scoring fallback:", e);
    }

    await storage.updateAiProfile(userId, profile);
    log("profile_updated", `${userName}: strategy=${profile.strategy}, CES=${profile.engagementScore}% (${profile._cesClassificationLabel || 'N/A'}), stage=${profile.relationshipStage}`);
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

async function generateStripeCheckoutUrl(userId: number, photoId: number, priceCzk: number): Promise<string | null> {
  try {
    const { getUncachableStripeClient } = await import("./stripeClient");
    const { isStripeConnected } = await import("./stripeClient");
    const connected = await isStripeConnected();
    if (!connected) { log("stripe_not_connected", "Stripe není propojeno"); return null; }

    const stripe = await getUncachableStripeClient();
    const user = await storage.getUser(userId);
    if (!user) return null;

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const { stripeService } = await import("./stripeService");
      const customer = await stripeService.createCustomer(user.name, { userId: String(user.id) });
      customerId = customer.id;
      await storage.updateStripeCustomerId(user.id, customerId);
    }

    const vaultItem = await storage.getContentItem(photoId);
    const isVideo = vaultItem?.mimeType?.startsWith("video") || vaultItem?.originalName?.match(/\.(mp4|mov|avi|MOV|MP4)$/i);
    const itemLabel = isVideo ? "Exkluzivní video" : "Exkluzivní fotka";

    const baseUrl = process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "http://localhost:5000";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'czk',
          product_data: {
            name: `${itemLabel} #${photoId} od Ninna Ray 🍒`,
            description: `Odemkni ${isVideo ? "privátní video" : "privátní fotku"} přímo v chatu 💋`,
          },
          unit_amount: priceCzk * 100,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/chat`,
      metadata: {
        userId: String(userId),
        contentItemId: String(photoId),
        type: 'content_purchase',
        source: 'ai_manager',
      },
    });

    await storage.createPayment({
      userId,
      contentItemId: photoId,
      amount: priceCzk * 100,
      currency: 'czk',
      status: 'pending',
      stripeSessionId: session.id,
      stripePaymentIntentId: null,
      type: 'content',
    });

    log("stripe_checkout_created", `User #${userId} — ${itemLabel} #${photoId} za ${priceCzk} Kč, session: ${session.id}`);
    return session.url || null;
  } catch (err) {
    log("stripe_checkout_error", `User #${userId}, photo #${photoId}: ${(err as Error).message}`);
    return null;
  }
}

async function executeAction(actionId: number, userId: number, message: string, photoId?: number, price?: number): Promise<boolean> {
  try {
    if (enginePaused) {
      log("exec_skipped", `Action #${actionId} — engine pozastaven`);
      return false;
    }

    if (!canSendToUser(userId)) {
      log("exec_throttled", `Action #${actionId} — uživatel ${userId} dosáhl limitu zpráv — odloženo o 60 min`);
      DELAYED_QUEUE.push({ actionId, userId, message, photoId, executeAt: Date.now() + 60 * 60 * 1000 });
      return false;
    }

    let finalMessage = message;

    if (photoId && price && price >= 29) {
      const checkoutUrl = await generateStripeCheckoutUrl(userId, photoId, price);
      if (checkoutUrl) {
        finalMessage = `${message}\n\n💎 [UNLOCK_CONTENT:${photoId}:${price}:${checkoutUrl}]`;
        log("exec_with_payment", `Action #${actionId} — přidán platební link, ${price} Kč`);
      }
    }

    const convs = await storage.getConversationsByUser(userId);
    if (convs.length === 0) {
      log("exec_no_conv", `User ${userId} — žádná konverzace, vytvářím novou`);
      const user = await storage.getUser(userId);
      const conv = await storage.createConversation(userId, user?.name || "Chat");
      await storage.createMessage(conv.id, "assistant", finalMessage);
    } else {
      const latestConv = convs[0];

      const msgs = await storage.getMessagesByConversation(latestConv.id);
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg && lastMsg.role === "assistant") {
        const lastMsgTime = new Date(lastMsg.createdAt).getTime();
        const timeSinceLastMsg = Date.now() - lastMsgTime;
        if (timeSinceLastMsg < 10 * 60 * 1000) {
          log("exec_too_soon", `Action #${actionId} — poslední zpráva před ${Math.round(timeSinceLastMsg / 60000)} min, čekám`);
          DELAYED_QUEUE.push({ actionId, userId, message: finalMessage, photoId, executeAt: Date.now() + 15 * 60 * 1000 });
          return false;
        }
      }

      await storage.createMessage(latestConv.id, "assistant", finalMessage);
    }

    if (photoId) {
      const vaultItem = await storage.getContentItem(photoId);
      if (vaultItem) {
        await storage.incrementContentUsage(photoId);
      }
    }

    recordSend(userId);

    await storage.updateManagerAction(actionId, {
      status: "done",
      result: price ? `auto-sent+stripe(${price}Kč)` : "auto-sent",
      executedAt: new Date(),
    });

    const user = await storage.getUser(userId);
    log("exec_sent", `→ ${user?.name || userId}: "${message.substring(0, 60)}..." ${photoId ? `[fotka #${photoId}]` : ""} ${price ? `[${price} Kč]` : ""}`);
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

async function scheduleOrExecuteAction(actionId: number, userId: number, message: string, timing: string, photoId?: number, price?: number) {
  const delayMs = parseTimingToMs(timing);

  if (delayMs === 0) {
    await executeAction(actionId, userId, message, photoId, price);
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
            await scheduleOrExecuteAction(created.id, user.id, action.message, action.timing || "teď", action.photoId || undefined, action.price || undefined);
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
    const recentActions = await storage.getManagerActions(new Date(Date.now() - 72 * 60 * 60 * 1000));
    const doneActions = recentActions.filter(a => a.status === "done" && a.userId);

    let gotResponse = 0;
    let noResponse = 0;
    const purposeStats: Record<string, { sent: number; responded: number }> = {};
    const timingStats: Record<string, { sent: number; responded: number }> = {};
    const responseTimes: number[] = [];

    for (const action of doneActions.slice(0, 100)) {
      if (!action.executedAt || !action.userId) continue;

      const convs = await storage.getConversationsByUser(action.userId);
      if (convs.length === 0) continue;

      const msgs = await storage.getMessagesByConversation(convs[0].id);
      const actionTime = new Date(action.executedAt).getTime();
      const userReply = msgs.find(m =>
        m.role === "user" && new Date(m.createdAt).getTime() > actionTime
      );

      const purpose = action.purpose || "unknown";
      if (!purposeStats[purpose]) purposeStats[purpose] = { sent: 0, responded: 0 };
      purposeStats[purpose].sent++;

      const timing = action.timing || "teď";
      if (!timingStats[timing]) timingStats[timing] = { sent: 0, responded: 0 };
      timingStats[timing].sent++;

      if (userReply) {
        gotResponse++;
        purposeStats[purpose].responded++;
        timingStats[timing].responded++;
        const replyTime = new Date(userReply.createdAt).getTime() - actionTime;
        if (replyTime > 0 && replyTime < 48 * 60 * 60 * 1000) {
          responseTimes.push(replyTime);
        }
      } else {
        noResponse++;
      }
    }

    const total = gotResponse + noResponse;
    if (total > 0) {
      const responseRate = Math.round((gotResponse / total) * 100);
      const avgResponseTime = responseTimes.length > 0 ? Math.round(responseTimes.reduce((s, t) => s + t, 0) / responseTimes.length / 60000) : 0;

      const bestPurposes: Record<string, { sent: number; responded: number; rate: number }> = {};
      for (const [p, s] of Object.entries(purposeStats)) {
        bestPurposes[p] = { ...s, rate: s.sent > 0 ? Math.round((s.responded / s.sent) * 100) : 0 };
      }

      const bestTimings: Record<string, { sent: number; responded: number; rate: number }> = {};
      for (const [t, s] of Object.entries(timingStats)) {
        bestTimings[t] = { ...s, rate: s.sent > 0 ? Math.round((s.responded / s.sent) * 100) : 0 };
      }

      globalLearnings = {
        totalSent: total,
        totalResponded: gotResponse,
        responseRate,
        bestPurposes,
        bestTimings,
        avgResponseTime,
        lastUpdated: new Date().toISOString(),
      };

      const bestPurpose = Object.entries(bestPurposes).sort((a, b) => b[1].rate - a[1].rate)[0];
      const worstPurpose = Object.entries(bestPurposes).sort((a, b) => a[1].rate - b[1].rate)[0];

      log("self_learn", `Response rate: ${responseRate}% (${gotResponse}/${total}) | Avg response: ${avgResponseTime} min`);
      if (bestPurpose) log("self_learn_best", `Nejlepší typ: "${bestPurpose[0]}" (${bestPurpose[1].rate}%)`);
      if (worstPurpose && worstPurpose[1].rate < 15 && worstPurpose[1].sent >= 3) {
        log("self_learn_warning", `Slabý typ: "${worstPurpose[0]}" (${worstPurpose[1].rate}%) — zvážit změnu přístupu`);
      }

      if (responseRate < 20 && total >= 5) {
        log("self_learn_alert", `Nízký celkový response rate (${responseRate}%) — engine automaticky upraví strategii`);
      }
    }

    const allPayments = await storage.getAllPayments();
    const completedPayments = allPayments.filter(p => p.status === "completed");
    if (completedPayments.length > 0) {
      const totalRevenue = completedPayments.reduce((s, p) => s + p.amount, 0) / 100;
      log("self_learn_revenue", `Celkové tržby: ${totalRevenue} Kč z ${completedPayments.length} plateb`);
    }
  } catch (err) {
    log("self_learn_error", (err as Error).message);
  }
}

async function updateAllEngagementScores() {
  if (enginePaused) return;
  try {
    const allUsers = await storage.getAllUsers();
    const customers = allUsers.filter(u => u.chatCode);
    let updated = 0;

    for (const user of customers) {
      try {
        const cesResult = await computeEngagementScore(user.id);
        const existingProfile = (user.aiProfile as any) || {};
        const { classification } = classifyByScore(cesResult.decayedScore);

        let status = "cold";
        let statusLabel = "Studený";
        if (classification === "monetized" || classification === "hot") {
          status = "hot";
          statusLabel = "Horký";
        } else if (classification === "warm") {
          status = "warm";
          statusLabel = "Teplý";
        }

        await storage.updateAiProfile(user.id, {
          ...existingProfile,
          engagementScore: cesResult.decayedScore,
          status,
          statusLabel,
          _cesRawScore: cesResult.rawScore,
          _cesClassification: cesResult.classification,
          _cesClassificationLabel: cesResult.classificationLabel,
          _cesComponents: cesResult.components,
          _cesDaysInactive: cesResult.daysInactive,
          _cesWeeksSinceLastActivity: cesResult.weeksSinceLastActivity,
          _cesLastUpdated: new Date().toISOString(),
        });
        updated++;
      } catch (e) {
        // skip individual user errors
      }
    }

    if (updated > 0) {
      log("ces_batch_update", `Updated engagement scores for ${updated}/${customers.length} customers`);
    }
  } catch (err) {
    log("ces_batch_error", (err as Error).message);
  }
}

const alerts: { id: string; type: string; severity: string; message: string; timestamp: string; userId?: number; dismissed: boolean }[] = [];

function addAlert(type: string, severity: "info" | "warning" | "critical", message: string, userId?: number) {
  const id = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  alerts.push({ id, type, severity, message, timestamp: new Date().toISOString(), userId, dismissed: false });
  if (alerts.length > 100) alerts.splice(0, alerts.length - 100);
  log("alert_created", `[${severity}] ${message}`);
}

export function getAlerts(includeDismissed = false) {
  return includeDismissed ? [...alerts] : alerts.filter(a => !a.dismissed);
}

export function dismissAlert(alertId: string) {
  const alert = alerts.find(a => a.id === alertId);
  if (alert) alert.dismissed = true;
}

async function reEngagementCheck() {
  if (enginePaused) return;
  try {
    const allUsers = await storage.getAllUsers();
    const allMessages = await storage.getAllMessages();
    const allConversations = await storage.getAllConversations();
    const customers = allUsers.filter(u => u.chatCode);

    const convToUser = new Map<number, number>();
    for (const c of allConversations) convToUser.set(c.id, c.userId);

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    let reEngaged = 0;

    for (const user of customers) {
      const userMsgs = allMessages.filter(m => {
        const uid = convToUser.get(m.conversationId);
        return uid === user.id && m.role === "user";
      });

      if (userMsgs.length === 0) continue;

      const lastMsgTime = Math.max(...userMsgs.map(m => new Date(m.createdAt).getTime()));
      const daysInactive = Math.floor((now - lastMsgTime) / DAY_MS);
      const profile = user.aiProfile as any;
      const engagement = profile?.engagementScore || 0;

      if (daysInactive >= 1 && daysInactive <= 3 && engagement >= 30 && canSendToUser(user.id)) {
        const reEngageMessages = [
          `Ahoj ${user.name} 🍒 Chyběl jsi mi... Co nového?`,
          `Hey ${user.name}! 💋 Dneska jsem myslela na tebe... Jak se máš?`,
          `${user.name}, mám pro tebe něco speciálního 🔥 Ozvi se mi!`,
        ];
        const msg = reEngageMessages[Math.floor(Math.random() * reEngageMessages.length)];

        const action = await storage.createManagerAction({
          userId: user.id,
          type: "message",
          message: msg,
          purpose: "re-engagement",
          timing: "teď",
        });

        await scheduleOrExecuteAction(action.id, user.id, msg, "teď");
        reEngaged++;
      }

      if (daysInactive >= 7 && engagement >= 20) {
        addAlert("inactive_user", "warning", `${user.name} neaktivní ${daysInactive} dní (engagement ${engagement}%)`, user.id);
      }
    }

    const allPayments = await storage.getAllPayments();
    const pendingPayments = allPayments.filter(p => p.status === "pending" && p.createdAt);
    for (const payment of pendingPayments) {
      const paymentAge = now - new Date(payment.createdAt!).getTime();
      if (paymentAge > 30 * 60 * 1000 && paymentAge < 2 * DAY_MS) {
        addAlert("cart_abandonment", "info", `Nedokončená platba ${(payment.amount / 100)} Kč pro uživatele #${payment.userId}`, payment.userId || undefined);
      }
    }

    if (reEngaged > 0) {
      log("re_engagement", `Auto-osloveno ${reEngaged} neaktivních zákazníků`);
    }

    const hotUsers = customers.filter(u => {
      const p = u.aiProfile as any;
      return p && (p.status === "hot" || p.statusLabel === "Horký");
    });
    if (hotUsers.length >= 3) {
      const recentPurchases = allPayments.filter(p => p.status === "completed" && p.createdAt && now - new Date(p.createdAt).getTime() < DAY_MS);
      if (recentPurchases.length === 0) {
        addAlert("hot_no_sales", "critical", `${hotUsers.length} horkých kontaktů bez prodeje za 24h — příležitost ke konverzi!`);
      }
    }
  } catch (err) {
    log("re_engagement_error", (err as Error).message);
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
  setInterval(() => {
    if (!enginePaused) updateAllEngagementScores();
  }, 60 * 60 * 1000);
  setInterval(() => {
    if (!enginePaused) reEngagementCheck();
  }, 15 * 60 * 1000);
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
      await scheduleOrExecuteAction(created.id, userId, action.message, action.timing || "teď", action.photoId || undefined, action.price || undefined);
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
          await scheduleOrExecuteAction(created.id, userId, action.message, action.timing || "teď", action.photoId || undefined, action.price || undefined);
        }
        log("auto_actions", `${userName}: ${profile.actionQueue.length} nových akcí auto-odesláno`);
      }
    } catch (err) {
      log("auto_reanalyze_error", (err as Error).message);
    }
  }
}

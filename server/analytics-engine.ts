import { storage } from "./storage";

export interface DailyMetric {
  date: string;
  revenue: number;
  transactions: number;
  newUsers: number;
  activeUsers: number;
  messages: number;
}

export interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

export interface ContentPerformance {
  id: number;
  name: string;
  category: string;
  timesUsed: number;
  timesSold: number;
  revenue: number;
  conversionRate: number;
  avgPrice: number;
  tags: string[];
}

export interface UserLTV {
  userId: number;
  name: string;
  totalSpent: number;
  transactionCount: number;
  avgTransaction: number;
  firstPurchase: string | null;
  lastPurchase: string | null;
  daysSinceFirst: number;
  monthlyValue: number;
  predictedLTV: number;
  segment: string;
  engagementScore: number;
  relationshipStage: string;
}

export interface DailyReport {
  generatedAt: string;
  period: string;
  revenue24h: number;
  transactions24h: number;
  newUsers24h: number;
  activeUsers24h: number;
  messages24h: number;
  funnelSnapshot: FunnelStage[];
  topContent: ContentPerformance[];
  topSpenders: { name: string; spent: number }[];
  engineActions24h: { total: number; executed: number; pending: number; failed: number };
  responseRate: number;
  avgEngagement: number;
  strategicNotes: string[];
}

export async function getDailyTimeline(days: number = 30): Promise<DailyMetric[]> {
  const safeDays = Math.min(Math.max(1, days || 30), 365);
  const allPayments = await storage.getAllPayments();
  const allUsers = await storage.getAllUsers();
  const allMessages = await storage.getAllMessages();
  const allConversations = await storage.getAllConversations();

  const convToUser = new Map<number, number>();
  for (const c of allConversations) {
    convToUser.set(c.id, c.userId);
  }

  const now = new Date();
  const timeline: DailyMetric[] = [];

  for (let i = safeDays - 1; i >= 0; i--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const dayPayments = allPayments.filter(p =>
      p.status === "completed" && p.createdAt && new Date(p.createdAt) >= dayStart && new Date(p.createdAt) <= dayEnd
    );
    const dayUsers = allUsers.filter(u => u.createdAt && new Date(u.createdAt) >= dayStart && new Date(u.createdAt) <= dayEnd);
    const dayMessages = allMessages.filter(m => m.createdAt && new Date(m.createdAt) >= dayStart && new Date(m.createdAt) <= dayEnd);
    const activeUserIds = new Set(
      dayMessages.filter(m => m.role === "user").map(m => convToUser.get(m.conversationId)).filter(Boolean)
    );

    timeline.push({
      date: dayStart.toISOString().split("T")[0],
      revenue: dayPayments.reduce((s, p) => s + (p.amount || 0), 0) / 100,
      transactions: dayPayments.length,
      newUsers: dayUsers.length,
      activeUsers: activeUserIds.size,
      messages: dayMessages.length,
    });
  }

  return timeline;
}

export async function getSalesFunnel(): Promise<FunnelStage[]> {
  const allUsers = await storage.getAllUsers();
  const customers = allUsers.filter(u => u.chatCode);

  let hot = 0, warm = 0, cold = 0, newU = 0, monetized = 0;

  for (const user of customers) {
    const profile = user.aiProfile as any;
    if (!profile) { newU++; continue; }

    const stage = profile.relationshipStage || "";
    const status = profile.status || "";

    const statusLower = status.toLowerCase();
    const stageLower = stage.toLowerCase();

    if (stageLower === "monetizace" || statusLower === "horký" || statusLower === "hot") { hot++; }
    else if (stageLower === "stabilní" || statusLower === "teplý" || statusLower === "warm") { warm++; }
    else if (stageLower === "budování" || statusLower === "studený" || statusLower === "cold") { cold++; }
    else { newU++; }
  }

  const allPayments = await storage.getAllPayments();
  const customerIds = new Set(customers.map(c => c.id));
  const buyerIds = new Set(allPayments.filter(p => p.status === "completed" && p.userId && customerIds.has(p.userId)).map(p => p.userId));
  monetized = buyerIds.size;

  const total = customers.length || 1;

  return [
    { stage: "all", label: "Celkem zákazníků", count: customers.length, percentage: 100, color: "#6b7280" },
    { stage: "new", label: "Noví", count: newU, percentage: Math.round((newU / total) * 100), color: "#3b82f6" },
    { stage: "cold", label: "Studení", count: cold, percentage: Math.round((cold / total) * 100), color: "#06b6d4" },
    { stage: "warm", label: "Teplí", count: warm, percentage: Math.round((warm / total) * 100), color: "#f59e0b" },
    { stage: "hot", label: "Horcí", count: hot, percentage: Math.round((hot / total) * 100), color: "#ef4444" },
    { stage: "monetized", label: "Platící", count: monetized, percentage: Math.round((monetized / total) * 100), color: "#10b981" },
  ];
}

export async function getContentPerformance(): Promise<ContentPerformance[]> {
  const allContent = await storage.getAllContentItems();
  const allPayments = await storage.getAllPayments();
  const completedPayments = allPayments.filter(p => p.status === "completed");

  return allContent.map(item => {
    const itemPayments = completedPayments.filter(p => p.contentItemId === item.id);
    const revenue = itemPayments.reduce((s, p) => s + (p.amount || 0), 0) / 100;

    return {
      id: item.id,
      name: item.originalName || item.filename,
      category: item.category,
      timesUsed: item.timesUsed,
      timesSold: itemPayments.length,
      revenue,
      conversionRate: item.timesUsed > 0 ? Math.round((itemPayments.length / item.timesUsed) * 1000) / 10 : 0,
      avgPrice: itemPayments.length > 0 ? Math.round(revenue / itemPayments.length) : 0,
      tags: item.tags || [],
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

export async function getUserLTVs(): Promise<UserLTV[]> {
  const allUsers = await storage.getAllUsers();
  const allPayments = await storage.getAllPayments();
  const completedPayments = allPayments.filter(p => p.status === "completed");

  const customers = allUsers.filter(u => u.chatCode);

  return customers.map(user => {
    const userPayments = completedPayments.filter(p => p.userId === user.id);
    const totalSpent = userPayments.reduce((s, p) => s + (p.amount || 0), 0) / 100;
    const sorted = userPayments.sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
    const firstPurchase = sorted[0]?.createdAt ? new Date(sorted[0].createdAt).toISOString() : null;
    const lastPurchase = sorted[sorted.length - 1]?.createdAt ? new Date(sorted[sorted.length - 1].createdAt).toISOString() : null;

    const daysSinceFirst = firstPurchase ? Math.max(1, Math.round((Date.now() - new Date(firstPurchase).getTime()) / (1000 * 60 * 60 * 24))) : 0;
    const monthlyValue = daysSinceFirst > 0 ? Math.round((totalSpent / daysSinceFirst) * 30 * 100) / 100 : 0;
    const predictedLTV = monthlyValue * 6;

    const profile = user.aiProfile as any;

    let segment = "non-buyer";
    if (totalSpent >= 500) segment = "vip";
    else if (totalSpent >= 100) segment = "mid";
    else if (totalSpent > 0) segment = "low";

    return {
      userId: user.id,
      name: user.name,
      totalSpent,
      transactionCount: userPayments.length,
      avgTransaction: userPayments.length > 0 ? Math.round(totalSpent / userPayments.length) : 0,
      firstPurchase,
      lastPurchase,
      daysSinceFirst,
      monthlyValue,
      predictedLTV,
      segment,
      engagementScore: profile?.engagementScore || 0,
      relationshipStage: profile?.relationshipStage || "neznámý",
    };
  }).sort((a, b) => b.predictedLTV - a.predictedLTV);
}

export async function generateDailyReport(): Promise<DailyReport> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const allPayments = await storage.getAllPayments();
  const allUsers = await storage.getAllUsers();
  const allMessages = await storage.getAllMessages();
  const allActions = await storage.getManagerActions(yesterday);
  const funnel = await getSalesFunnel();
  const contentPerf = await getContentPerformance();

  const recent24h = (d: Date | null) => d && new Date(d) >= yesterday;

  const payments24h = allPayments.filter(p => p.status === "completed" && recent24h(p.createdAt));
  const users24h = allUsers.filter(u => recent24h(u.createdAt));
  const messages24h = allMessages.filter(m => recent24h(m.createdAt));

  const executedActions = allActions.filter(a => a.status === "done");
  const pendingActions = allActions.filter(a => a.status === "pending");
  const failedActions = allActions.filter(a => a.status === "failed");

  const allConversations = await storage.getAllConversations();
  const userConvMap = new Map<number, Set<number>>();
  for (const c of allConversations) {
    if (!userConvMap.has(c.userId)) userConvMap.set(c.userId, new Set());
    userConvMap.get(c.userId)!.add(c.id);
  }

  const sentActions = allActions.filter(a => a.status === "done" && a.purpose);
  const repliedActions = sentActions.filter(a => {
    if (!a.userId || !a.executedAt) return false;
    const userConvIds = userConvMap.get(a.userId);
    if (!userConvIds) return false;
    return allMessages.some(m =>
      m.role === "user" && userConvIds.has(m.conversationId) && m.createdAt && new Date(m.createdAt) > new Date(a.executedAt!)
    );
  });
  const responseRate = sentActions.length > 0 ? Math.round((repliedActions.length / sentActions.length) * 100) : 0;

  const customers = allUsers.filter(u => u.chatCode);
  const avgEngagement = customers.reduce((s, u) => {
    const prof = u.aiProfile as any;
    return s + (prof?.engagementScore || 0);
  }, 0) / (customers.length || 1);

  const topSpenders = allPayments
    .filter(p => p.status === "completed" && recent24h(p.createdAt))
    .reduce((acc, p) => {
      const user = allUsers.find(u => u.id === p.userId);
      const name = user?.name || `User #${p.userId}`;
      acc[name] = (acc[name] || 0) + (p.amount || 0) / 100;
      return acc;
    }, {} as Record<string, number>);

  const strategicNotes: string[] = [];
  const convRate = customers.length > 0
    ? (new Set(allPayments.filter(p => p.status === "completed").map(p => p.userId)).size / customers.length) * 100
    : 0;

  if (convRate < 5) strategicNotes.push("Konverzní poměr pod 5% — zaměřit se na první nákup s nízkou bariérou (39-59 Kč).");
  if (funnel.find(f => f.stage === "cold")!.count > funnel.find(f => f.stage === "warm")!.count * 2) {
    strategicNotes.push("Příliš mnoho studených kontaktů — zvýšit frekvenci engagement zpráv.");
  }
  if (payments24h.length === 0) strategicNotes.push("Žádný prodej za 24h — zvážit flash nabídku nebo teaser kampaň.");
  if (responseRate < 30 && sentActions.length >= 5) strategicNotes.push("Nízká response rate (<30%) — upravit tón zpráv nebo timing.");
  if (avgEngagement < 40) strategicNotes.push("Průměrný engagement pod 40% — posílit personalizaci konverzací.");

  const hotCount = funnel.find(f => f.stage === "hot")?.count || 0;
  if (hotCount > 0 && payments24h.length === 0) {
    strategicNotes.push(`${hotCount} horkých kontaktů bez prodeje — okamžitě nabídnout exkluzivní obsah.`);
  }

  return {
    generatedAt: now.toISOString(),
    period: "24h",
    revenue24h: payments24h.reduce((s, p) => s + (p.amount || 0), 0) / 100,
    transactions24h: payments24h.length,
    newUsers24h: users24h.length,
    activeUsers24h: new Set(messages24h.filter(m => m.role === "user").map(m => m.conversationId)).size,
    messages24h: messages24h.length,
    funnelSnapshot: funnel,
    topContent: contentPerf.slice(0, 5),
    topSpenders: Object.entries(topSpenders).map(([name, spent]) => ({ name, spent })).sort((a, b) => b.spent - a.spent).slice(0, 5),
    engineActions24h: {
      total: allActions.length,
      executed: executedActions.length,
      pending: pendingActions.length,
      failed: failedActions.length,
    },
    responseRate,
    avgEngagement: Math.round(avgEngagement),
    strategicNotes,
  };
}

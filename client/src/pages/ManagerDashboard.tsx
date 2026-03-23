import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";

type ActionItem = {
  message: string;
  timing: string;
  purpose: "build" | "sell" | "hook";
  photoId: number | null;
  photoNote: string | null;
};

type CommunicationPatterns = {
  msgLength?: string;
  responseSpeed?: string;
  usesEmoji?: boolean;
  tone?: string;
  peakHours?: string;
};

type AiProfile = {
  status: "hot" | "warm" | "cold" | "new";
  statusLabel: string;
  engagementScore: number;
  buyingPotential: string;
  strategy?: "build" | "sell" | "hook";
  summary: string;
  personality: string[];
  interests: string[];
  emotionalTriggers?: string[];
  communicationPatterns?: CommunicationPatterns;
  whatWorks?: string[];
  whatFails?: string[];
  mainDriver?: string;
  nextAction?: string;
  actionQueue?: ActionItem[];
  suggestedMessages?: string[];
  contentIdeas?: string[];
  styleNotes?: string;
  trendInsights?: string[];
  warnings?: string[];
  relationshipStage?: string;
  nextMilestone?: string;
  lastAnalyzed: string;
};

type ManagerUser = {
  id: number;
  name: string;
  messageCount: number;
  createdAt: string;
  conversations: number;
  totalMessages: number;
  lastActivity: string | null;
  aiProfile: AiProfile | null;
  aiProfileUpdatedAt: string | null;
};

type ContentItem = {
  id: number;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  tags: string[];
  category: string;
  description: string | null;
  timesUsed: number;
  createdAt: string;
};

type TrendData = {
  trendingTopics: string[];
  contentRecommendations: { type: string; description: string; priority: string }[];
  promotionStrategy: { platform: string; action: string; timing: string }[];
  engagementTips: string[];
  warnings: string[];
  weeklyPlan: Record<string, string>;
  summary: string;
  analyzedAt: string;
};

const STATUS_CONFIG = {
  hot: { label: "🔥 Horký", bg: "bg-red-500/20", border: "border-red-500/40", text: "text-red-400" },
  warm: { label: "⚡ Teplý", bg: "bg-orange-500/20", border: "border-orange-500/40", text: "text-orange-400" },
  cold: { label: "❄️ Studený", bg: "bg-blue-500/20", border: "border-blue-500/40", text: "text-blue-400" },
  new: { label: "🌱 Nový", bg: "bg-neutral-700/40", border: "border-neutral-600", text: "text-neutral-400" },
};

const DAY_NAMES: Record<string, string> = {
  monday: "Pondělí", tuesday: "Úterý", wednesday: "Středa",
  thursday: "Čtvrtek", friday: "Pátek", saturday: "Sobota", sunday: "Neděle",
};

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const login = async () => {
    const res = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw, role: "owner", username: "Manager" }),
    });
    if (res.ok) onSuccess();
    else setError("Špatné heslo");
  };
  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-8 space-y-5">
        <div className="text-center">
          <div className="text-4xl mb-2">🧠</div>
          <h1 className="text-xl font-bold text-white" data-testid="text-manager-title">AI Manager</h1>
          <p className="text-neutral-500 text-sm mt-1">Autonomní správce agentury</p>
        </div>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === "Enter" && login()} placeholder="Owner heslo"
          data-testid="input-manager-password"
          className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-3 outline-none focus:border-emerald-500 transition-colors" />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button onClick={login} disabled={!pw.trim()} data-testid="button-manager-login"
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-colors">
          Přihlásit
        </button>
      </motion.div>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-red-500" : score >= 40 ? "bg-orange-400" : "bg-blue-500";
  return (
    <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
      <motion.div initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.8, ease: "easeOut" }}
        className={`h-full rounded-full ${color}`} />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <button onClick={copy} data-testid="button-copy" className="text-[10px] text-neutral-600 hover:text-emerald-400 transition-colors ml-2 shrink-0">
      {copied ? "✓" : "📋"}
    </button>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Grouping helpers ────────────────────────────────────────────────────────

type UserGroup = {
  name: string;
  sessions: ManagerUser[];
  bestProfile: AiProfile | null;
  bestStatus: "hot" | "warm" | "cold" | "new";
  totalMessages: number;
  totalConversations: number;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function groupUsers(users: ManagerUser[]): UserGroup[] {
  const map = new Map<string, ManagerUser[]>();
  users.forEach(u => {
    const key = normalizeName(u.name);
    const arr = map.get(key) || [];
    arr.push(u);
    map.set(key, arr);
  });
  const statusRank = { hot: 0, warm: 1, cold: 2, new: 3 };
  return Array.from(map.values()).map(sessions => {
    const withProfile = sessions.filter(s => s.aiProfile);
    const bestProfile = withProfile.sort((a, b) => statusRank[a.aiProfile!.status] - statusRank[b.aiProfile!.status])[0]?.aiProfile || null;
    return {
      name: sessions[0].name,
      sessions,
      bestProfile,
      bestStatus: bestProfile?.status || "new",
      totalMessages: sessions.reduce((s, u) => s + u.totalMessages, 0),
      totalConversations: sessions.reduce((s, u) => s + u.conversations, 0),
    };
  });
}

// ─── Chat history for detail view ────────────────────────────────────────────

type ConvMessage = { role: string; content: string; createdAt: string };
type ConvData = { id: number; title: string; messages: ConvMessage[] };

function ChatHistory({ userIds }: { userIds: number[] }) {
  const [convs, setConvs] = useState<ConvData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/manager/users/bulk-conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds }),
    })
      .then(r => r.json())
      .then(data => { setConvs(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userIds.join(",")]);

  if (loading) return <div className="p-4 text-center text-neutral-500 text-sm">Načítám konverzace...</div>;

  const allMessages = convs.flatMap(conv =>
    conv.messages.map(msg => ({ ...msg, convTitle: conv.title }))
  ).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (allMessages.length === 0) return <div className="p-4 text-center text-neutral-500 text-sm">Žádné zprávy</div>;

  let lastDate = "";

  return (
    <div className="px-4 py-3 space-y-1.5" data-testid="chat-history">
      {allMessages.map((msg, idx) => {
        const msgDate = new Date(msg.createdAt).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
        const showDate = msgDate !== lastDate;
        lastDate = msgDate;
        const isUser = msg.role === "user";
        return (
          <div key={idx}>
            {showDate && (
              <div className="text-center my-3">
                <span className="text-[10px] bg-neutral-800 text-neutral-500 px-3 py-1 rounded-full">{msgDate}</span>
              </div>
            )}
            <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div data-testid={`msg-bubble-${idx}`}
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs ${isUser ? "bg-emerald-600/30 text-emerald-100 rounded-br-md" : "bg-neutral-800 text-neutral-300 rounded-bl-md"}`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <p className={`text-[9px] mt-1 ${isUser ? "text-emerald-400/60" : "text-neutral-600"}`}>
                  {new Date(msg.createdAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Detail Action Queue with vault photos ──────────────────────────────────

function DetailActionQueue({ actions, purposeConfig }: { actions: ActionItem[]; purposeConfig: Record<string, { icon: string; label: string; cls: string }> }) {
  const { data: vaultItems = [] } = useQuery<ContentItem[]>({
    queryKey: ["/api/vault/items"],
    queryFn: () => fetch("/api/vault/items").then(r => r.json()),
  });
  const vaultMap = new Map(vaultItems.map(v => [v.id, v]));
  const isImg = (fn: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(fn);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">📨 Fronta zpráv k odeslání</p>
      {actions.map((action, i) => {
        const aCfg = purposeConfig[action.purpose] || purposeConfig.build;
        const vaultItem = action.photoId ? vaultMap.get(action.photoId) : null;
        const hasPhoto = vaultItem && isImg(vaultItem.filename);
        return (
          <div key={i} data-testid={`action-card-${i}`}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${aCfg.cls}`}>{aCfg.icon} {aCfg.label}</span>
                <span className="text-[10px] text-neutral-500">⏰ {action.timing}</span>
              </div>
              <CopyButton text={action.message} />
            </div>
            <div className="bg-neutral-800/60 rounded-lg px-3 py-2">
              <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{action.message}</p>
            </div>
            {hasPhoto && (
              <div className="flex items-start gap-3">
                <button onClick={() => setExpandedIdx(expandedIdx === i ? null : i)} className="shrink-0">
                  <img src={`/uploads/${vaultItem!.filename}`} alt="Fotka"
                    className={`rounded-lg border border-pink-500/30 object-cover transition-all cursor-pointer hover:brightness-110 ${expandedIdx === i ? "w-40 h-40" : "w-14 h-14"}`} />
                </button>
                <div>
                  <p className="text-[10px] text-pink-400 font-bold">📸 Fotka #{action.photoId}</p>
                  {action.photoNote && <p className="text-[10px] text-pink-300">{action.photoNote}</p>}
                </div>
              </div>
            )}
            {action.photoId && !hasPhoto && (
              <p className="text-[10px] text-pink-400">📸 Fotka #{action.photoId}{action.photoNote ? ` — ${action.photoNote}` : ""}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Customers ──────────────────────────────────────────────────────────

function CustomersTab({ users, qc, selectedGroup, setSelectedGroup, initialFilter }: { users: ManagerUser[]; qc: ReturnType<typeof useQueryClient>; selectedGroup: string | null; setSelectedGroup: (g: string | null) => void; initialFilter?: string }) {
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [filter, setFilter] = useState<"all" | "hot" | "warm" | "cold" | "new">((initialFilter as any) || "all");
  const [search, setSearch] = useState("");

  const analyzeMut = useMutation({
    mutationFn: async (userId: number) => {
      setAnalyzingId(userId);
      const res = await fetch(`/api/manager/analyze/${userId}`, { method: "POST" });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/manager/overview"] }); setAnalyzingId(null); },
    onError: () => setAnalyzingId(null),
  });

  const analyzeAll = async () => {
    setBatchRunning(true);
    await fetch("/api/manager/analyze-all", { method: "POST" });
    setTimeout(() => { qc.invalidateQueries({ queryKey: ["/api/manager/overview"] }); setBatchRunning(false); }, 15000);
  };

  const groups = groupUsers(users);

  const filteredGroups = groups
    .filter(g => filter === "all" || g.bestStatus === filter)
    .filter(g => !search.trim() || g.name.toLowerCase().includes(search.trim().toLowerCase()));

  const activeGroup = groups.find(g => g.name === selectedGroup);
  const primaryUser = activeGroup?.sessions.find(s => s.aiProfile) || activeGroup?.sessions[0];

  const counts = {
    all: groups.length,
    hot: groups.filter(g => g.bestStatus === "hot").length,
    warm: groups.filter(g => g.bestStatus === "warm").length,
    cold: groups.filter(g => g.bestStatus === "cold").length,
    new: groups.filter(g => g.bestStatus === "new").length,
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className={`w-full md:w-96 border-r border-neutral-800 flex flex-col overflow-hidden ${selectedGroup !== null ? "hidden md:flex" : "flex"}`}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
          <div className="flex gap-1 overflow-x-auto">
            {(["all", "hot", "warm", "cold", "new"] as const).map(f => (
              <button key={f} onClick={() => { setFilter(f); setSelectedGroup(null); }}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors whitespace-nowrap ${filter === f ? "bg-neutral-700 text-white" : "text-neutral-500 hover:text-neutral-300"}`}>
                {f === "all" ? `Vše (${counts.all})` : f === "hot" ? `🔥${counts.hot}` : f === "warm" ? `⚡${counts.warm}` : f === "cold" ? `❄️${counts.cold}` : `🌱${counts.new}`}
              </button>
            ))}
          </div>
          <button onClick={analyzeAll} disabled={batchRunning} data-testid="button-analyze-all"
            className={`text-[10px] px-3 py-1.5 rounded-lg font-bold transition-colors shrink-0 ml-2 ${batchRunning ? "bg-neutral-700 text-neutral-500" : "bg-emerald-600 hover:bg-emerald-500 text-white"}`}>
            {batchRunning ? "⏳..." : "⚡ Vše"}
          </button>
        </div>
        <div className="px-3 py-2 border-b border-neutral-800">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hledat..."
            data-testid="input-search-users"
            className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-1.5 text-xs outline-none focus:border-emerald-500" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredGroups.map(group => {
            const cfg = STATUS_CONFIG[group.bestStatus];
            const isSelected = selectedGroup === group.name;
            const p = group.bestProfile;
            const stratLabel = p?.strategy === "sell" ? "💰 SELL" : p?.strategy === "hook" ? "🎣 HOOK" : p?.strategy === "build" ? "🤝 BUILD" : null;
            return (
              <button key={group.name} onClick={() => setSelectedGroup(group.name)} data-testid={`button-select-group-${group.name}`}
                className={`w-full text-left px-3 py-2.5 border-b border-neutral-800/50 hover:bg-neutral-800/40 transition-colors ${isSelected ? "bg-neutral-800" : ""}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs border shrink-0 ${cfg.bg} ${cfg.border} ${cfg.text}`}>{group.name[0]?.toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-sm truncate">{group.name}</p>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ml-1 ${cfg.bg} ${cfg.border} ${cfg.text}`}>{cfg.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-neutral-500">{group.totalMessages} zpráv</span>
                      {p && <span className="text-[10px] text-neutral-600">· {p.engagementScore}%</span>}
                      {stratLabel && <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${p?.strategy === "sell" ? "bg-yellow-500/20 text-yellow-400" : p?.strategy === "hook" ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"}`}>{stratLabel}</span>}
                      {p?.relationshipStage && <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${p.relationshipStage === "monetizace" ? "bg-yellow-500/15 text-yellow-400" : p.relationshipStage === "stabilní" ? "bg-emerald-500/15 text-emerald-400" : "bg-neutral-700 text-neutral-400"}`}>{p.relationshipStage}</span>}
                    </div>
                    {p?.mainDriver && <p className="text-[10px] text-neutral-400 truncate mt-0.5">{p.mainDriver}</p>}
                    {group.sessions[0]?.lastActivity && <p className="text-[9px] text-neutral-600 mt-0.5">🕐 {formatDistanceToNow(new Date(group.sessions[0].lastActivity), { locale: cs, addSuffix: true })}</p>}
                  </div>
                </div>
              </button>
            );
          })}
          {filteredGroups.length === 0 && <div className="text-center text-neutral-600 py-12 text-sm">Žádní zákazníci</div>}
        </div>
      </div>

      <div className={`flex-1 flex flex-col overflow-hidden ${selectedGroup === null ? "hidden md:flex" : "flex"}`}>
        {!activeGroup || !primaryUser ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
            <div className="text-4xl">👥</div>
            <p className="text-neutral-500 text-sm">Vyber zákazníka ze seznamu</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="sticky top-0 border-b border-neutral-800 px-4 py-2 bg-neutral-950/95 backdrop-blur flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedGroup(null)} className="md:hidden text-neutral-500 hover:text-white">←</button>
                <p className="font-bold text-sm">{activeGroup.name}</p>
                {activeGroup.sessions.length > 1 && <span className="text-[10px] text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded">{activeGroup.sessions.length} sessions</span>}
              </div>
              <button onClick={() => primaryUser && analyzeMut.mutate(primaryUser.id)} disabled={analyzingId === primaryUser?.id} data-testid="button-analyze-user"
                className="text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg font-bold">
                {analyzingId === primaryUser?.id ? "⏳..." : "🧠 Analyzovat"}
              </button>
            </div>

            {!activeGroup.bestProfile ? (
              <div className="flex flex-col items-center justify-center p-12 text-center gap-3">
                <p className="text-neutral-500 text-sm">Neanalyzován</p>
                <button onClick={() => primaryUser && analyzeMut.mutate(primaryUser.id)} className="bg-emerald-600 text-white px-5 py-2 rounded-xl font-bold text-sm">Spustit analýzu</button>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {(() => {
                  const p = activeGroup.bestProfile!;
                  const cfg = STATUS_CONFIG[p.status];
                  const purposeConfig = {
                    build: { icon: "🤝", label: "BUILD", cls: "bg-blue-500/20 border-blue-500/30 text-blue-400" },
                    sell: { icon: "💰", label: "SELL", cls: "bg-yellow-500/20 border-yellow-500/30 text-yellow-400" },
                    hook: { icon: "🎣", label: "HOOK", cls: "bg-purple-500/20 border-purple-500/30 text-purple-400" },
                  };
                  const strat = p.strategy || "build";
                  const stratCfg = purposeConfig[strat];
                  return (<>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${cfg.bg} ${cfg.border} ${cfg.text}`}>{cfg.label}</span>
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${stratCfg.cls}`}>{stratCfg.icon} {stratCfg.label}</span>
                      <span className="text-xs text-neutral-500">{p.engagementScore}% eng · {p.buyingPotential}</span>
                      {p.lastAnalyzed && <span className="text-[9px] text-neutral-600 ml-auto">🕐 {formatDistanceToNow(new Date(p.lastAnalyzed), { locale: cs, addSuffix: true })}</span>}
                    </div>
                    <ScoreBar score={p.engagementScore} />

                    {(p.mainDriver || p.nextAction) && (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">🎯 Hlavní driver</p>
                        <p className="text-sm text-emerald-300 font-medium">{p.mainDriver || p.nextAction}</p>
                      </div>
                    )}

                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">📋 Kontext</p>
                      <p className="text-xs text-neutral-300">{p.summary}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {p.personality.map((t, i) => <span key={i} className="text-[9px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">{t}</span>)}
                        {p.interests.map((t, i) => <span key={`int-${i}`} className="text-[9px] bg-pink-500/15 text-pink-400 px-1.5 py-0.5 rounded">{t}</span>)}
                      </div>
                    </div>

                    {p.relationshipStage && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400">
                          {p.relationshipStage === "nový" ? "🌱" : p.relationshipStage === "budování" ? "🤝" : p.relationshipStage === "stabilní" ? "💎" : p.relationshipStage === "monetizace" ? "💰" : "🎣"} {p.relationshipStage}
                        </span>
                        {p.nextMilestone && <span className="text-[10px] text-neutral-400">→ {p.nextMilestone}</span>}
                      </div>
                    )}

                    {p.communicationPatterns && (
                      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">📡 Komunikační vzory</p>
                        <div className="flex flex-wrap gap-1.5">
                          {p.communicationPatterns.tone && <span className="text-[9px] bg-violet-500/15 text-violet-400 px-1.5 py-0.5 rounded">🎭 {p.communicationPatterns.tone}</span>}
                          {p.communicationPatterns.msgLength && <span className="text-[9px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">📝 {p.communicationPatterns.msgLength}</span>}
                          {p.communicationPatterns.responseSpeed && <span className="text-[9px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">⚡ {p.communicationPatterns.responseSpeed}</span>}
                          {p.communicationPatterns.usesEmoji !== undefined && <span className="text-[9px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">{p.communicationPatterns.usesEmoji ? "😊 emoji" : "🚫 bez emoji"}</span>}
                          {p.communicationPatterns.peakHours && <span className="text-[9px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">🕐 {p.communicationPatterns.peakHours}</span>}
                        </div>
                      </div>
                    )}

                    {(p.emotionalTriggers || []).length > 0 && (
                      <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1.5">⚡ Emoční spouštěče</p>
                        <div className="space-y-1">
                          {(p.emotionalTriggers || []).map((t, i) => (
                            <p key={i} className="text-xs text-red-200">→ {t}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      {(p.whatWorks || []).length > 0 && (
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-2.5">
                          <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mb-1">✅ Funguje</p>
                          {(p.whatWorks || []).map((w, i) => <p key={i} className="text-[10px] text-emerald-200">• {w}</p>)}
                        </div>
                      )}
                      {(p.whatFails || []).length > 0 && (
                        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-2.5">
                          <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest mb-1">❌ Nefunguje</p>
                          {(p.whatFails || []).map((w, i) => <p key={i} className="text-[10px] text-red-200">• {w}</p>)}
                        </div>
                      )}
                    </div>

                    {p.styleNotes && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-1">🎨 Styl komunikace</p>
                        <p className="text-xs text-amber-200">{p.styleNotes}</p>
                      </div>
                    )}

                    {(p.actionQueue || []).length > 0 && (
                      <DetailActionQueue actions={p.actionQueue!} purposeConfig={purposeConfig} />
                    )}

                    {(p.suggestedMessages || []).length > 0 && !(p.actionQueue || []).length && (
                      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">✍️ Navrhované zprávy</p>
                        {(p.suggestedMessages || []).map((msg, i) => (
                          <div key={i} className="flex items-start justify-between gap-1 bg-neutral-800/60 rounded-lg px-2 py-2 mb-1">
                            <p className="text-xs text-white">{msg}</p>
                            <CopyButton text={msg} />
                          </div>
                        ))}
                      </div>
                    )}

                    {(p.trendInsights || []).length > 0 && (
                      <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-2">📈 Trendy</p>
                        {(p.trendInsights || []).map((tip, i) => (
                          <div key={i} className="flex items-start gap-1 mb-1"><span className="text-purple-400 text-xs">→</span><p className="text-xs text-purple-200">{tip}</p></div>
                        ))}
                      </div>
                    )}
                  </>);
                })()}
              </div>
            )}

            <div className="border-t border-neutral-800 mt-2">
              <div className="px-4 py-3">
                <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">💬 Historie konverzací</p>
              </div>
              <ChatHistory userIds={activeGroup.sessions.map(s => s.id)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Content Vault ──────────────────────────────────────────────────────

function VaultTab() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [desc, setDesc] = useState("");
  const [tags, setTags] = useState("");
  const [category, setCategory] = useState("general");

  const { data: items = [], isLoading } = useQuery<ContentItem[]>({
    queryKey: ["/api/vault/items"],
    queryFn: () => fetch("/api/vault/items").then(r => r.json()),
  });

  const handleUpload = async () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const tagsParsed = JSON.stringify(tags.split(",").map(t => t.trim()).filter(Boolean));
    for (let i = 0; i < files.length; i++) {
      const fd = new FormData();
      fd.append("files", files[i]);
      fd.append("description", desc);
      fd.append("tags", tagsParsed);
      fd.append("category", category);
      await fetch("/api/vault/upload", { method: "POST", body: fd });
    }
    qc.invalidateQueries({ queryKey: ["/api/vault/items"] });
    setDesc(""); setTags(""); setCategory("general");
    if (fileRef.current) fileRef.current.value = "";
    setUploading(false);
  };

  const deleteMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/vault/items/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/vault/items"] }),
  });

  const CATS = [
    { value: "general", label: "Obecné" },
    { value: "photo", label: "📸 Fotky" },
    { value: "video", label: "🎬 Videa" },
    { value: "audio", label: "🎵 Audio" },
    { value: "ppv", label: "💎 PPV" },
    { value: "teaser", label: "🔥 Teaser" },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">📤 Nahrát obsah</p>
        <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" multiple
          data-testid="input-vault-file"
          className="w-full text-sm text-neutral-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 file:cursor-pointer" />
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Popis (volitelné)"
          data-testid="input-vault-description"
          className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500" />
        <div className="flex gap-2">
          <input value={tags} onChange={e => setTags(e.target.value)} placeholder="Tagy (oddělené čárkou)"
            data-testid="input-vault-tags"
            className="flex-1 bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500" />
          <select value={category} onChange={e => setCategory(e.target.value)} data-testid="select-vault-category"
            className="bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-2 text-sm outline-none">
            {CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <button onClick={handleUpload} disabled={uploading} data-testid="button-vault-upload"
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
          {uploading ? "⏳ Nahrávám..." : "📤 Nahrát"}
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">📦 Vault · {items.length} položek</p>
        {isLoading && <p className="text-neutral-600 text-sm text-center py-8">Načítám...</p>}
        {items.map(item => (
          <div key={item.id} data-testid={`card-vault-item-${item.id}`}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 ${
              item.mimeType.startsWith("image") ? "bg-pink-500/20" :
              item.mimeType.startsWith("video") ? "bg-purple-500/20" :
              item.mimeType.startsWith("audio") ? "bg-blue-500/20" : "bg-neutral-800"
            }`}>
              {item.mimeType.startsWith("image") ? "📸" : item.mimeType.startsWith("video") ? "🎬" : item.mimeType.startsWith("audio") ? "🎵" : "📄"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{item.originalName}</p>
              <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                <span>{formatSize(item.size)}</span>
                <span>·</span>
                <span>Použito {item.timesUsed}×</span>
                {item.category !== "general" && <><span>·</span><span>{CATS.find(c => c.value === item.category)?.label}</span></>}
              </div>
              {item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {item.tags.map((t, i) => <span key={i} className="text-[9px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">{t}</span>)}
                </div>
              )}
            </div>
            <button onClick={() => deleteMut.mutate(item.id)} data-testid={`button-delete-vault-${item.id}`}
              className="text-neutral-600 hover:text-red-400 text-sm transition-colors shrink-0">🗑️</button>
          </div>
        ))}
        {!isLoading && items.length === 0 && (
          <div className="text-center text-neutral-600 py-8 text-sm">Vault je prázdný — nahraj svůj první obsah</div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Trends ─────────────────────────────────────────────────────────────

function TrendsTab() {
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/manager/trends", { method: "POST" });
      const data = await res.json();
      setTrends(data);
    } catch {}
    setLoading(false);
  };

  const PRIO = { vysoká: "text-red-400 bg-red-500/20 border-red-500/30", střední: "text-orange-400 bg-orange-500/20 border-orange-500/30", nízká: "text-blue-400 bg-blue-500/20 border-blue-500/30" };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white font-bold">📊 Trend Scanner</p>
          <p className="text-neutral-500 text-xs">AI analyzuje tvou agenturu a doporučí strategii</p>
        </div>
        <button onClick={analyze} disabled={loading} data-testid="button-scan-trends"
          className="text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold">
          {loading ? "⏳ Analyzuji..." : "🔍 Skenovat trendy"}
        </button>
      </div>

      {!trends && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="text-5xl">📊</div>
          <p className="text-neutral-500 text-sm">Klikni "Skenovat trendy" pro AI analýzu</p>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="text-5xl animate-pulse">🧠</div>
          <p className="text-neutral-400 text-sm">AI analyzuje data a trendy...</p>
        </div>
      )}

      {trends && !loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
            <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-2">📝 Shrnutí</p>
            <p className="text-sm text-emerald-300 leading-relaxed">{trends.summary}</p>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">🔥 Trendy</p>
            <div className="flex flex-wrap gap-2">
              {trends.trendingTopics.map((t, i) => <span key={i} className="text-xs bg-pink-500/20 border border-pink-500/30 text-pink-400 px-2 py-1 rounded-lg">{t}</span>)}
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">🎬 Content doporučení</p>
            <div className="space-y-2">
              {trends.contentRecommendations.map((r, i) => (
                <div key={i} className="flex items-start gap-2 bg-neutral-800/60 rounded-lg px-3 py-2">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${PRIO[r.priority as keyof typeof PRIO] || PRIO.nízká}`}>{r.priority}</span>
                  <div><p className="text-xs text-neutral-400">{r.type}</p><p className="text-sm text-white">{r.description}</p></div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">📢 Kde a jak promovat</p>
            <div className="space-y-2">
              {trends.promotionStrategy.map((s, i) => (
                <div key={i} className="bg-neutral-800/60 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-white">{s.platform}</span>
                    <span className="text-[10px] text-neutral-500">{s.timing}</span>
                  </div>
                  <p className="text-xs text-neutral-300">{s.action}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">📅 Týdenní plán</p>
            <div className="space-y-1.5">
              {Object.entries(trends.weeklyPlan).map(([day, task]) => (
                <div key={day} className="flex gap-2 text-sm">
                  <span className="text-neutral-500 font-bold w-16 shrink-0 text-xs pt-0.5">{DAY_NAMES[day] || day}</span>
                  <p className="text-neutral-300 text-xs">{task}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">💡 Engagement tipy</p>
            {trends.engagementTips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2 mb-1"><span className="text-emerald-500 text-xs">✓</span><p className="text-xs text-neutral-300">{tip}</p></div>
            ))}
          </div>

          {trends.warnings.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-2">⚠️ Varování</p>
              {trends.warnings.map((w, i) => <p key={i} className="text-xs text-red-300">{w}</p>)}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ─── Tab: Broadcast ──────────────────────────────────────────────────────────

function BroadcastTab() {
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; sent: number } | null>(null);

  const send = async () => {
    if (!msg.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/manager/broadcast", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      setResult(data);
      setMsg("");
    } catch {}
    setSending(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div>
        <p className="text-white font-bold">📢 Broadcast zpráva</p>
        <p className="text-neutral-500 text-xs">Pošli zprávu všem zákazníkům najednou</p>
      </div>
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
        <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={4}
          placeholder="Napíš zprávu pro všechny zákazníky..."
          data-testid="textarea-broadcast"
          className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 resize-none" />
        <button onClick={send} disabled={sending || !msg.trim()} data-testid="button-broadcast-send"
          className="w-full bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
          {sending ? "⏳ Odesílám..." : `📢 Odeslat všem`}
        </button>
      </div>

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
            <p className="text-emerald-400 font-bold">✓ Odesláno do {result.sent} konverzací</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">💡 Tipy pro broadcast</p>
        <div className="space-y-1.5 text-xs text-neutral-400">
          <p>→ Personalizuj — nejlepší broadcast vypadá jako osobní zpráva</p>
          <p>→ Přidej urgenci — "Jen dnes" nebo "Posledních X míst"</p>
          <p>→ Nepřeháněj — max 2-3 broadcasty týdně</p>
          <p>→ Nejlepší čas — pátek večer, sobota odpoledne</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

type EngineStatus = {
  isRunning: boolean;
  isPaused: boolean;
  lastFullScan: string | null;
  nextScan: string | null;
  recentLogs: { time: string; event: string; detail: string }[];
  pendingDelayed: number;
};

type ManagerActionRecord = {
  id: number;
  userId: number | null;
  type: string;
  status: string;
  message: string | null;
  photoId: number | null;
  purpose: string | null;
  timing: string | null;
  result: string | null;
  executedAt: string | null;
  createdAt: string;
};

function OverviewTab({ users, onNavigate }: { users: ManagerUser[]; onNavigate?: (tab: "customers", filter?: string) => void }) {
  const qc = useQueryClient();
  const { data: engineStatus } = useQuery<EngineStatus>({
    queryKey: ["/api/manager/engine-status"],
    refetchInterval: 10000,
    queryFn: () => fetch("/api/manager/engine-status").then(r => r.json()),
  });

  const { data: actions = [] } = useQuery<ManagerActionRecord[]>({
    queryKey: ["/api/manager/actions"],
    refetchInterval: 15000,
    queryFn: () => fetch("/api/manager/actions").then(r => r.json()),
  });

  const { data: vaultItems = [] } = useQuery<ContentItem[]>({
    queryKey: ["/api/vault/items"],
    queryFn: () => fetch("/api/vault/items").then(r => r.json()),
  });

  const vaultMap = new Map(vaultItems.map(v => [v.id, v]));

  const markDone = async (id: number) => {
    await fetch(`/api/manager/actions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    qc.invalidateQueries({ queryKey: ["/api/manager/actions"] });
  };

  const dismissAction = async (id: number) => {
    await fetch(`/api/manager/actions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    qc.invalidateQueries({ queryKey: ["/api/manager/actions"] });
  };

  const [actionFilter, setActionFilter] = useState<"all" | "build" | "sell" | "hook">("all");
  const [showLogs, setShowLogs] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [expandedPhoto, setExpandedPhoto] = useState<number | null>(null);

  const groups = groupUsers(users);
  const totalMessages = users.reduce((s, u) => s + u.totalMessages, 0);
  const analyzed = users.filter(u => u.aiProfile).length;
  const withProfiles = users.filter(u => u.aiProfile);
  const hotCount = groups.filter(g => g.bestStatus === "hot").length;
  const warmCount = groups.filter(g => g.bestStatus === "warm").length;
  const coldCount = groups.filter(g => g.bestStatus === "cold").length;
  const newCount = groups.filter(g => g.bestStatus === "new").length;
  const avgEngagement = withProfiles.reduce((s, u) => s + ((u.aiProfile as any)?.engagementScore || 0), 0) / (analyzed || 1);

  const stratCounts = { build: 0, sell: 0, hook: 0 };
  const stageCounts: Record<string, number> = {};
  const buyPotCounts: Record<string, number> = {};
  withProfiles.forEach(u => {
    const p = u.aiProfile as any;
    if (p?.strategy && stratCounts[p.strategy as keyof typeof stratCounts] !== undefined) stratCounts[p.strategy as keyof typeof stratCounts]++;
    if (p?.relationshipStage) stageCounts[p.relationshipStage] = (stageCounts[p.relationshipStage] || 0) + 1;
    if (p?.buyingPotential) buyPotCounts[p.buyingPotential] = (buyPotCounts[p.buyingPotential] || 0) + 1;
  });

  const pendingActions = actions.filter(a => a.status === "pending");
  const doneActions = actions.filter(a => a.status === "done");

  const filteredPending = actionFilter === "all" ? pendingActions : pendingActions.filter(a => a.purpose === actionFilter);

  const purposeConfig: Record<string, { icon: string; label: string; cls: string }> = {
    build: { icon: "🤝", label: "BUILD", cls: "bg-blue-500/20 border-blue-500/30 text-blue-400" },
    sell: { icon: "💰", label: "SELL", cls: "bg-yellow-500/20 border-yellow-500/30 text-yellow-400" },
    hook: { icon: "🎣", label: "HOOK", cls: "bg-purple-500/20 border-purple-500/30 text-purple-400" },
  };

  const userNameMap = new Map(users.map(u => [u.id, u.name]));

  const buildPct = pendingActions.length ? Math.round(pendingActions.filter(a => a.purpose === "build").length / pendingActions.length * 100) : 0;
  const sellPct = pendingActions.length ? Math.round(pendingActions.filter(a => a.purpose === "sell").length / pendingActions.length * 100) : 0;
  const hookPct = pendingActions.length ? Math.round(pendingActions.filter(a => a.purpose === "hook").length / pendingActions.length * 100) : 0;

  const isImgFile = (fn: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(fn);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className={`flex items-center gap-3 p-3 rounded-xl border ${engineStatus?.isPaused ? "bg-red-500/10 border-red-500/30" : engineStatus?.isRunning ? "bg-amber-500/10 border-amber-500/30" : "bg-emerald-500/10 border-emerald-500/30"}`}>
        <div className={`w-3 h-3 rounded-full ${engineStatus?.isPaused ? "bg-red-400" : engineStatus?.isRunning ? "bg-amber-400 animate-pulse" : "bg-emerald-400 animate-pulse"}`} />
        <div className="flex-1">
          <p className={`text-sm font-bold ${engineStatus?.isPaused ? "text-red-300" : engineStatus?.isRunning ? "text-amber-300" : "text-emerald-300"}`}>
            {engineStatus?.isPaused ? "⏸ Engine pozastaven" : engineStatus?.isRunning ? "⏳ Analyzuje zákazníky..." : "✓ Engine běží — odesílá zprávy"}
          </p>
          <p className="text-[10px] text-neutral-400">
            {engineStatus?.lastFullScan ? `Poslední scan: ${formatDistanceToNow(new Date(engineStatus.lastFullScan), { locale: cs, addSuffix: true })}` : "První scan se připravuje..."}
            {engineStatus?.nextScan && ` · Další: ${formatDistanceToNow(new Date(engineStatus.nextScan), { locale: cs, addSuffix: true })}`}
            {(engineStatus?.pendingDelayed || 0) > 0 && ` · ${engineStatus!.pendingDelayed} naplánovaných`}
          </p>
        </div>
        <button onClick={async () => {
          const newState = !engineStatus?.isPaused;
          await fetch("/api/manager/engine-pause", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused: newState }) });
          qc.invalidateQueries({ queryKey: ["/api/manager/engine-status"] });
        }} data-testid="button-toggle-engine"
          className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors ${engineStatus?.isPaused ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-red-600/80 hover:bg-red-500 text-white"}`}>
          {engineStatus?.isPaused ? "▶ Spustit" : "⏸ Pozastavit"}
        </button>
        <button onClick={() => setShowLogs(!showLogs)} data-testid="button-toggle-logs"
          className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors px-2 py-1 rounded bg-neutral-800/50">
          {showLogs ? "Skrýt" : "📋"}
        </button>
      </div>

      <AnimatePresence>
        {showLogs && engineStatus?.recentLogs && engineStatus.recentLogs.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
              {engineStatus.recentLogs.slice(-20).reverse().map((log, i) => (
                <div key={i} className="flex items-start gap-2 text-[10px]">
                  <span className="text-neutral-600 shrink-0">{new Date(log.time).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                  <span className={`shrink-0 ${log.event.includes("error") ? "text-red-400" : log.event.includes("complete") ? "text-emerald-400" : "text-neutral-400"}`}>{log.event}</span>
                  {log.detail && <span className="text-neutral-500 truncate">{log.detail}</span>}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-4 gap-2">
        {([
          { status: "hot" as const, count: hotCount, icon: "🔥", label: "Horký", bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", textSub: "text-red-300" },
          { status: "warm" as const, count: warmCount, icon: "⚡", label: "Teplý", bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400", textSub: "text-orange-300" },
          { status: "cold" as const, count: coldCount, icon: "❄️", label: "Studený", bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", textSub: "text-blue-300" },
          { status: "new" as const, count: newCount, icon: "🌱", label: "Nový", bg: "bg-neutral-700/30", border: "border-neutral-600", text: "text-neutral-400", textSub: "text-neutral-400" },
        ]).map(s => (
          <button key={s.status} onClick={() => onNavigate?.("customers", s.status)} data-testid={`nav-status-${s.status}`}
            className={`${s.bg} border ${s.border} rounded-xl p-2.5 text-center hover:brightness-125 transition-all cursor-pointer`}>
            <p className={`text-lg font-bold ${s.text}`}>{s.count}</p>
            <p className={`text-[9px] ${s.textSub}`}>{s.icon} {s.label}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center" data-testid="stat-card-0">
          <p className="text-lg font-bold text-white">{groups.length}</p>
          <p className="text-[10px] text-neutral-500">👥 Zákazníci</p>
          <p className="text-[9px] text-neutral-600">{analyzed} analýz</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center" data-testid="stat-card-1">
          <p className={`text-lg font-bold ${avgEngagement >= 60 ? "text-red-400" : avgEngagement >= 35 ? "text-orange-400" : "text-blue-400"}`}>{Math.round(avgEngagement)}%</p>
          <p className="text-[10px] text-neutral-500">📊 Engagement</p>
          <p className="text-[9px] text-neutral-600">{avgEngagement >= 60 ? "silný" : avgEngagement >= 35 ? "střední" : "nízký"}</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center" data-testid="stat-card-2">
          <p className="text-lg font-bold text-emerald-400">{pendingActions.length}</p>
          <p className="text-[10px] text-neutral-500">📨 K odeslání</p>
          <p className="text-[9px] text-neutral-600">{doneActions.length} hotovo</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-white">
            {filteredPending.length > 0 ? `⏳ Čekající na odeslání (${filteredPending.length})` : `✓ Vše odesláno — ${doneActions.length} zpráv`}
          </p>
          <div className="flex gap-1">
            {(["all", "build", "sell", "hook"] as const).map(f => (
              <button key={f} onClick={() => setActionFilter(f)} data-testid={`filter-action-${f}`}
                className={`text-[9px] px-2 py-1 rounded transition-colors ${actionFilter === f ? "bg-neutral-700 text-white" : "text-neutral-600 hover:text-neutral-400"}`}>
                {f === "all" ? "Vše" : purposeConfig[f].icon + " " + purposeConfig[f].label}
              </button>
            ))}
          </div>
        </div>

        {pendingActions.length > 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-2.5">
            <div className="flex items-center gap-1 h-2 rounded-full overflow-hidden">
              {buildPct > 0 && <div className="bg-blue-500 h-full rounded-full" style={{ width: `${buildPct}%` }} />}
              {sellPct > 0 && <div className="bg-yellow-500 h-full rounded-full" style={{ width: `${sellPct}%` }} />}
              {hookPct > 0 && <div className="bg-purple-500 h-full rounded-full" style={{ width: `${hookPct}%` }} />}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-blue-400">BUILD {buildPct}%</span>
              <span className="text-[9px] text-yellow-400">SELL {sellPct}%</span>
              <span className="text-[9px] text-purple-400">HOOK {hookPct}%</span>
            </div>
          </div>
        )}

        {filteredPending.length === 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center">
            <p className="text-neutral-600 text-sm">Žádné čekající akce</p>
          </div>
        )}

        {filteredPending.slice(0, 30).map(action => {
          const pCfg = purposeConfig[action.purpose || "build"] || purposeConfig.build;
          const vaultItem = action.photoId ? vaultMap.get(action.photoId) : null;
          const hasPhoto = vaultItem && isImgFile(vaultItem.filename);
          return (
            <motion.div key={action.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -100 }}
              data-testid={`pending-action-${action.id}`}
              className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-white">{userNameMap.get(action.userId!) || "?"}</span>
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${pCfg.cls}`}>{pCfg.icon} {pCfg.label}</span>
                    {action.timing && <span className="text-[10px] text-neutral-500">⏰ {action.timing}</span>}
                  </div>
                  <span className="text-[9px] text-neutral-600">{formatDistanceToNow(new Date(action.createdAt), { locale: cs, addSuffix: true })}</span>
                </div>

                {action.message && (
                  <div className="bg-neutral-800/60 rounded-lg px-3 py-2.5">
                    <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{action.message}</p>
                  </div>
                )}

                {hasPhoto && (
                  <div className="flex items-start gap-3">
                    <button onClick={() => setExpandedPhoto(expandedPhoto === action.id ? null : action.id)} className="shrink-0" data-testid={`photo-preview-${action.id}`}>
                      <img src={`/uploads/${vaultItem!.filename}`} alt="Doporučená fotka"
                        className={`rounded-lg border border-pink-500/30 object-cover transition-all cursor-pointer hover:brightness-110 ${expandedPhoto === action.id ? "w-48 h-48" : "w-16 h-16"}`} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-pink-400 font-bold">📸 Doporučená fotka #{action.photoId}</p>
                      {vaultItem!.description && <p className="text-[10px] text-neutral-400 mt-0.5">{vaultItem!.description}</p>}
                      {vaultItem!.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {vaultItem!.tags.map((t, i) => <span key={i} className="text-[8px] bg-pink-500/15 text-pink-400 px-1 py-0.5 rounded">{t}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {action.photoId && !hasPhoto && vaultItem && (
                  <p className="text-[10px] text-pink-400">📎 Doporučený soubor #{action.photoId}: {vaultItem.filename}</p>
                )}
                {action.photoId && !vaultItem && (
                  <p className="text-[10px] text-neutral-500">📸 Fotka #{action.photoId} (není ve vaultu)</p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => markDone(action.id)} data-testid={`btn-done-${action.id}`}
                    className="flex items-center gap-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition-colors">
                    ✓ Odesláno
                  </button>
                  {action.message && <CopyButton text={action.message} />}
                  <button onClick={() => dismissAction(action.id)} data-testid={`btn-dismiss-${action.id}`}
                    className="text-[10px] text-neutral-600 hover:text-red-400 transition-colors ml-auto px-2 py-1">
                    ✕ Zahodit
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
        {filteredPending.length > 30 && <p className="text-[10px] text-neutral-600 text-center">+ dalších {filteredPending.length - 30} akcí</p>}
      </div>

      {doneActions.length > 0 && (
        <div className="space-y-2">
          <button onClick={() => setShowDone(!showDone)} data-testid="btn-toggle-done"
            className="flex items-center gap-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors">
            <span>{showDone ? "▼" : "▶"}</span>
            <span>✅ Odesláno manažerem ({doneActions.length} zpráv)</span>
          </button>
          <AnimatePresence>
            {showDone && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5">
                {doneActions.slice(0, 30).map(action => {
                  const pCfg = purposeConfig[action.purpose || "build"] || purposeConfig.build;
                  const vaultItem = action.photoId ? vaultMap.get(action.photoId) : null;
                  return (
                    <div key={action.id} className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-emerald-400">✓</span>
                          <span className="text-xs font-bold text-neutral-300">{userNameMap.get(action.userId!) || "?"}</span>
                          <span className={`text-[8px] font-bold px-1 py-0.5 rounded border ${pCfg.cls}`}>{pCfg.icon}</span>
                          {action.result === "auto-sent" && <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1 py-0.5 rounded">AUTO</span>}
                        </div>
                        {action.executedAt && <span className="text-[9px] text-neutral-600">{formatDistanceToNow(new Date(action.executedAt), { locale: cs, addSuffix: true })}</span>}
                      </div>
                      <p className="text-xs text-neutral-400 leading-relaxed">{action.message?.substring(0, 120)}{(action.message?.length || 0) > 120 ? "..." : ""}</p>
                      {vaultItem && isImgFile(vaultItem.filename) && (
                        <img src={`/uploads/${vaultItem.filename}`} alt="" className="w-10 h-10 rounded object-cover border border-neutral-700 inline-block" />
                      )}
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Strategie</p>
          <div className="space-y-1.5">
            {([["build", "🤝 BUILD", "text-blue-400", "bg-blue-500"], ["sell", "💰 SELL", "text-yellow-400", "bg-yellow-500"], ["hook", "🎣 HOOK", "text-purple-400", "bg-purple-500"]] as const).map(([key, label, textCls, bgCls]) => (
              <div key={key} className="flex items-center gap-2">
                <span className={`text-[10px] w-16 ${textCls}`}>{label}</span>
                <div className="flex-1 bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                  <div className={`h-full rounded-full ${bgCls}`} style={{ width: `${analyzed ? (stratCounts[key] / analyzed * 100) : 0}%` }} />
                </div>
                <span className="text-[10px] text-neutral-500 w-6 text-right">{stratCounts[key]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Kupní potenciál</p>
          <div className="space-y-1.5">
            {(["vysoký", "střední", "nízký"] as const).map(level => {
              const count = buyPotCounts[level] || 0;
              const color = level === "vysoký" ? "bg-emerald-500" : level === "střední" ? "bg-amber-500" : "bg-neutral-600";
              return (
                <div key={level} className="flex items-center gap-2">
                  <span className="text-[10px] text-neutral-400 w-14">{level}</span>
                  <div className="flex-1 bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${analyzed ? (count / analyzed * 100) : 0}%` }} />
                  </div>
                  <span className="text-[10px] text-neutral-500 w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {Object.keys(stageCounts).length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Fáze vztahu</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stageCounts).sort((a, b) => b[1] - a[1]).map(([stage, count]) => {
              const stageIcons: Record<string, string> = { "nový": "🌱", "budování": "🤝", "stabilní": "💎", "monetizace": "💰", "reaktivace": "🎣" };
              return (
                <div key={stage} className="bg-neutral-800 rounded-lg px-2.5 py-1.5 text-center">
                  <p className="text-xs font-bold text-white">{count}</p>
                  <p className="text-[9px] text-neutral-400">{stageIcons[stage] || "📍"} {stage}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {vaultItems.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest mb-2">📦 Vault — poslední obsah</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {vaultItems.filter(v => isImgFile(v.filename)).slice(0, 8).map(item => (
              <div key={item.id} className="shrink-0">
                <img src={`/uploads/${item.filename}`} alt={item.description || item.filename}
                  className="w-16 h-16 rounded-lg object-cover border border-neutral-700" />
                <p className="text-[8px] text-neutral-600 text-center mt-0.5">#{item.id}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ManagerDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "customers" | "vault" | "trends" | "broadcast">("overview");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [initialFilter, setInitialFilter] = useState<string | undefined>(undefined);
  const qc = useQueryClient();

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => setAuthed(d.role === "owner")).catch(() => setAuthed(false));
  }, []);

  const { data: users = [], isLoading } = useQuery<ManagerUser[]>({
    queryKey: ["/api/manager/overview"],
    enabled: authed === true,
    refetchInterval: 20000,
    queryFn: () => fetch("/api/manager/overview").then(r => r.json()),
  });

  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); setAuthed(false); };

  if (authed === null) return <div className="min-h-screen bg-neutral-950 flex items-center justify-center"><div className="text-neutral-600">Načítám...</div></div>;
  if (authed === false) return <LoginForm onSuccess={() => { setAuthed(true); window.location.reload(); }} />;

  const TABS = [
    { id: "overview" as const, icon: "🧠", label: "Přehled" },
    { id: "customers" as const, icon: "👥", label: "Zákazníci" },
    { id: "vault" as const, icon: "📦", label: "Vault" },
    { id: "trends" as const, icon: "📊", label: "Trendy" },
    { id: "broadcast" as const, icon: "📢", label: "Broadcast" },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <div className="border-b border-neutral-800 bg-neutral-900/80 backdrop-blur px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">🧠</span>
          <div>
            <h1 className="font-bold text-sm leading-none" data-testid="text-dashboard-title">AI Manager</h1>
            <p className="text-neutral-500 text-[10px]">{users.length} zákazníků · autonomní režim</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Engine aktivní" />
        </div>
        <button onClick={logout} data-testid="button-logout" className="text-neutral-500 hover:text-white text-xs transition-colors">Odhlásit</button>
      </div>

      <div className="flex border-b border-neutral-800 bg-neutral-900/40 px-2">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            data-testid={`tab-${tab.id}`}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold transition-colors border-b-2 ${
              activeTab === tab.id ? "border-emerald-500 text-white" : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}>
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === "overview" && <OverviewTab users={users} onNavigate={(tab, filter) => { setActiveTab(tab); setInitialFilter(filter); setSelectedGroup(null); }} />}
        {activeTab === "customers" && <CustomersTab users={users} qc={qc} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} initialFilter={initialFilter} />}
        {activeTab === "vault" && <VaultTab />}
        {activeTab === "trends" && <TrendsTab />}
        {activeTab === "broadcast" && <BroadcastTab />}
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";

type AiProfile = {
  status: "hot" | "warm" | "cold" | "new";
  statusLabel: string;
  engagementScore: number;
  summary: string;
  personality: string[];
  interests: string[];
  buyingPotential: string;
  nextAction: string;
  suggestedMessages: string[];
  contentIdeas: string[];
  warnings: string[];
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

type UserGroup = {
  name: string;
  sessions: ManagerUser[];
  totalMessages: number;
  totalConversations: number;
  lastActivity: string | null;
  bestProfile: AiProfile | null;
  bestStatus: "hot" | "warm" | "cold" | "new";
};

type ConversationDetail = {
  id: number;
  title: string;
  manualMode: boolean;
  assignedAgent: string | null;
  createdAt: string;
  messageCount: number;
  lastMessage: { role: string; content: string; createdAt: string } | null;
  messages: { id: number; role: string; content: string; createdAt: string }[];
};

function groupUsers(users: ManagerUser[]): UserGroup[] {
  const map = new Map<string, ManagerUser[]>();
  for (const u of users) {
    const key = u.name.trim().toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(u);
  }

  const statusPriority: Record<string, number> = { hot: 0, warm: 1, cold: 2, new: 3 };

  const groups: UserGroup[] = [];
  for (const [, sessions] of map) {
    const totalMessages = sessions.reduce((s, u) => s + u.totalMessages, 0);
    const totalConversations = sessions.reduce((s, u) => s + u.conversations, 0);
    const activities = sessions.map(u => u.lastActivity).filter(Boolean) as string[];
    const lastActivity = activities.length > 0 ? activities.sort().reverse()[0] : null;

    let bestProfile: AiProfile | null = null;
    let bestStatus: "hot" | "warm" | "cold" | "new" = "new";
    for (const u of sessions) {
      if (u.aiProfile) {
        const uStatus = u.aiProfile.status || "new";
        if (!bestProfile || (statusPriority[uStatus] ?? 3) < (statusPriority[bestStatus] ?? 3)) {
          bestProfile = u.aiProfile;
          bestStatus = uStatus;
        }
      }
    }

    groups.push({
      name: sessions[0].name,
      sessions,
      totalMessages,
      totalConversations,
      lastActivity,
      bestProfile,
      bestStatus,
    });
  }

  groups.sort((a, b) => {
    const sDiff = (statusPriority[a.bestStatus] ?? 3) - (statusPriority[b.bestStatus] ?? 3);
    if (sDiff !== 0) return sDiff;
    const aT = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
    const bT = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
    return bT - aT;
  });

  return groups;
}

// ─── Tab: Customers (Messenger-style) ────────────────────────────────────────

function ChatStream({ userIds }: { userIds: number[] }) {
  const { data: convs, isLoading } = useQuery<ConversationDetail[]>({
    queryKey: ["/api/manager/bulk-conversations", ...userIds],
    queryFn: () => fetch("/api/manager/users/bulk-conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds }),
    }).then(r => r.json()),
  });
  const msgsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (convs && convs.length > 0) {
      setTimeout(() => msgsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [convs]);

  if (isLoading) return <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">Nacitam zpravy...</div>;

  const allMessages = (convs || []).flatMap(conv =>
    conv.messages.map(msg => ({ ...msg, convTitle: conv.title }))
  ).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (allMessages.length === 0) return <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">Zadne zpravy</div>;

  let lastDate = "";

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5" data-testid="chat-stream">
      {allMessages.map((msg, idx) => {
        const msgDate = new Date(msg.createdAt).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
        const showDate = msgDate !== lastDate;
        lastDate = msgDate;

        return (
          <div key={msg.id}>
            {showDate && (
              <div className="flex justify-center my-3">
                <span className="text-[10px] bg-neutral-800 text-neutral-500 px-3 py-1 rounded-full">{msgDate}</span>
              </div>
            )}
            <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div data-testid={`msg-bubble-${msg.id}`}
                className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-emerald-600 text-white rounded-br-sm"
                    : msg.role === "system"
                    ? "bg-neutral-800/50 text-neutral-500 text-xs italic rounded-bl-sm"
                    : "bg-neutral-800 text-neutral-200 rounded-bl-sm"
                }`}>
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                <p className={`text-[9px] mt-1 ${msg.role === "user" ? "text-emerald-200/50" : "text-neutral-600"}`}>
                  {new Date(msg.createdAt).toLocaleString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={msgsEndRef} />
    </div>
  );
}

function ProfilePanel({ group, analyzeMut, analyzingId }: { group: UserGroup; analyzeMut: any; analyzingId: number | null }) {
  if (!group.bestProfile) {
    return (
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-8 text-center gap-3">
        <p className="text-neutral-500 text-sm">Neanalyzovan</p>
        <button onClick={() => { for (const s of group.sessions) analyzeMut.mutate(s.id); }}
          data-testid="button-run-analysis"
          className="bg-emerald-600 text-white px-5 py-2 rounded-xl font-bold text-sm">Spustit analyzu</button>
      </div>
    );
  }
  const p = group.bestProfile;
  const cfg = STATUS_CONFIG[p.status];
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${cfg.bg} ${cfg.border} ${cfg.text}`}>{cfg.label}</span>
        <span className="text-xs text-neutral-500">Potencial: <strong className={p.buyingPotential === "vysoký" ? "text-red-400" : p.buyingPotential === "střední" ? "text-orange-400" : "text-blue-400"}>{p.buyingPotential}</strong></span>
      </div>
      <div><div className="flex justify-between text-[10px] text-neutral-500 mb-1"><span>Engagement</span><span className="font-bold">{p.engagementScore}%</span></div><ScoreBar score={p.engagementScore} /></div>
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
        <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">📋 Profil</p>
        <p className="text-sm text-neutral-300">{p.summary}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">🎭 Osobnost</p>
          <div className="flex flex-wrap gap-1">{p.personality.map((t, i) => <span key={i} className="text-[10px] bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded">{t}</span>)}</div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">❤️ Zajmy</p>
          <div className="flex flex-wrap gap-1">{p.interests.map((t, i) => <span key={i} className="text-[10px] bg-pink-500/20 border border-pink-500/30 text-pink-400 px-1.5 py-0.5 rounded">{t}</span>)}</div>
        </div>
      </div>
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
        <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">💡 Doporucena akce</p>
        <p className="text-sm text-emerald-300">{p.nextAction}</p>
      </div>
      {p.suggestedMessages.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">✍️ Navrhovane zpravy</p>
          {p.suggestedMessages.map((msg, i) => (
            <div key={i} className="flex items-start justify-between gap-1 bg-neutral-800/60 rounded-lg px-2 py-2 mb-1">
              <p className="text-xs text-white">{msg}</p>
              <CopyButton text={msg} />
            </div>
          ))}
        </div>
      )}
      {p.contentIdeas.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">🎬 Content napady</p>
          {p.contentIdeas.map((idea, i) => (
            <div key={i} className="flex items-start gap-1 mb-1"><span className="text-pink-500 text-xs">→</span><p className="text-xs text-neutral-300">{idea}</p></div>
          ))}
        </div>
      )}
      {p.warnings.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-1">⚠️ Varovani</p>
          {p.warnings.map((w, i) => <p key={i} className="text-xs text-red-300">{w}</p>)}
        </div>
      )}
    </div>
  );
}

function CustomersTab({ users, qc }: { users: ManagerUser[]; qc: ReturnType<typeof useQueryClient> }) {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [filter, setFilter] = useState<"all" | "hot" | "warm" | "cold" | "new">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const groups = groupUsers(users);

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

  const filteredGroups = groups
    .filter(g => filter === "all" || g.bestStatus === filter)
    .filter(g => !searchQuery || g.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const selectedGroupData = groups.find(g => g.name.toLowerCase() === selectedGroup?.toLowerCase());

  const uniqueCounts = {
    all: groups.length,
    hot: groups.filter(g => g.bestStatus === "hot").length,
    warm: groups.filter(g => g.bestStatus === "warm").length,
    cold: groups.filter(g => g.bestStatus === "cold").length,
    new: groups.filter(g => g.bestStatus === "new").length,
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className={`w-full md:w-80 border-r border-neutral-800 flex flex-col overflow-hidden ${selectedGroup !== null ? "hidden md:flex" : "flex"}`}>
        <div className="px-3 py-2 border-b border-neutral-800 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex gap-1 overflow-x-auto">
              {(["all", "hot", "warm", "cold", "new"] as const).map(f => (
                <button key={f} onClick={() => { setFilter(f); setSelectedGroup(null); }}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors whitespace-nowrap ${filter === f ? "bg-neutral-700 text-white" : "text-neutral-500 hover:text-neutral-300"}`}>
                  {f === "all" ? `Vse (${uniqueCounts.all})` : f === "hot" ? `🔥${uniqueCounts.hot}` : f === "warm" ? `⚡${uniqueCounts.warm}` : f === "cold" ? `❄️${uniqueCounts.cold}` : `🌱${uniqueCounts.new}`}
                </button>
              ))}
            </div>
            <button onClick={analyzeAll} disabled={batchRunning} data-testid="button-analyze-all"
              className={`text-[10px] px-3 py-1.5 rounded-lg font-bold transition-colors shrink-0 ml-2 ${batchRunning ? "bg-neutral-700 text-neutral-500" : "bg-emerald-600 hover:bg-emerald-500 text-white"}`}>
              {batchRunning ? "⏳..." : "⚡ Vše"}
            </button>
          </div>
          <input
            type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Hledat zakaznika..."
            data-testid="input-search-users"
            className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-1.5 text-xs outline-none focus:border-emerald-500 placeholder-neutral-600"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredGroups.map(group => {
            const cfg = STATUS_CONFIG[group.bestStatus];
            const isSelected = selectedGroup?.toLowerCase() === group.name.toLowerCase();
            const lastMsg = group.sessions.reduce((best, s) => {
              if (s.lastActivity && (!best || s.lastActivity > best)) return s.lastActivity;
              return best;
            }, "" as string);
            return (
              <button key={group.name} onClick={() => { setSelectedGroup(group.name); setShowProfile(false); }}
                data-testid={`button-select-group-${group.name}`}
                className={`w-full text-left px-3 py-2.5 border-b border-neutral-800/50 hover:bg-neutral-800/40 transition-colors ${isSelected ? "bg-neutral-800" : ""}`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border shrink-0 ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                    {group.name[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-sm truncate">{group.name}</p>
                        {group.sessions.length > 1 && (
                          <span className="text-[8px] bg-neutral-700 text-neutral-400 px-1 py-0.5 rounded-full font-bold shrink-0">{group.sessions.length}x</span>
                        )}
                      </div>
                      {lastMsg && (
                        <span className="text-[9px] text-neutral-600 shrink-0 ml-1">
                          {formatDistanceToNow(new Date(lastMsg), { addSuffix: false, locale: cs })}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-500 truncate mt-0.5">{group.totalMessages} zprav</p>
                  </div>
                </div>
              </button>
            );
          })}
          {filteredGroups.length === 0 && <div className="text-center text-neutral-600 py-12 text-sm">Zadni zakaznici</div>}
        </div>
      </div>

      <div className={`flex-1 flex flex-col overflow-hidden ${selectedGroup === null ? "hidden md:flex" : "flex"}`}>
        {!selectedGroupData ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
            <div className="text-4xl">💬</div>
            <p className="text-neutral-500 text-sm">Vyber zakaznika ze seznamu</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="border-b border-neutral-800 px-4 py-2 bg-neutral-900/80 backdrop-blur flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <button onClick={() => { setSelectedGroup(null); setShowProfile(false); }} className="md:hidden text-neutral-500 hover:text-white text-sm" data-testid="button-back">←</button>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border shrink-0 ${STATUS_CONFIG[selectedGroupData.bestStatus].bg} ${STATUS_CONFIG[selectedGroupData.bestStatus].border} ${STATUS_CONFIG[selectedGroupData.bestStatus].text}`}>
                  {selectedGroupData.name[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-sm leading-tight">{selectedGroupData.name}</p>
                  <p className="text-[10px] text-neutral-500">{selectedGroupData.totalMessages} zprav · {selectedGroupData.bestProfile?.statusLabel || "Novy"}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => { for (const s of selectedGroupData.sessions) analyzeMut.mutate(s.id); }}
                  disabled={analyzingId !== null} data-testid="button-analyze-user"
                  className="text-[10px] bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-300 px-2.5 py-1.5 rounded-lg font-bold transition-colors">
                  {analyzingId !== null ? "⏳" : "🧠"}
                </button>
                <button onClick={() => setShowProfile(!showProfile)} data-testid="button-toggle-profile"
                  className={`text-[10px] px-2.5 py-1.5 rounded-lg font-bold transition-colors ${showProfile ? "bg-emerald-600 text-white" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300"}`}>
                  {showProfile ? "💬 Chat" : "📋 Profil"}
                </button>
              </div>
            </div>

            {showProfile ? (
              <ProfilePanel group={selectedGroupData} analyzeMut={analyzeMut} analyzingId={analyzingId} />
            ) : (
              <ChatStream userIds={selectedGroupData.sessions.map(s => s.id)} />
            )}
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
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [desc, setDesc] = useState("");
  const [tags, setTags] = useState("");
  const [category, setCategory] = useState("general");

  const { data: items = [], isLoading } = useQuery<ContentItem[]>({
    queryKey: ["/api/vault/items"],
    queryFn: () => fetch("/api/vault/items").then(r => r.json()),
  });

  const handleFileSelect = () => {
    const files = fileRef.current?.files;
    if (files) setSelectedFiles(Array.from(files));
  };

  const removeFile = (idx: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    const total = selectedFiles.length;
    setUploadProgress({ done: 0, total });

    const batchSize = 5;
    for (let i = 0; i < total; i += batchSize) {
      const batch = selectedFiles.slice(i, i + batchSize);
      const fd = new FormData();
      for (const file of batch) {
        fd.append("files", file);
      }
      fd.append("description", desc);
      fd.append("tags", JSON.stringify(tags.split(",").map(t => t.trim()).filter(Boolean)));
      fd.append("category", category);
      await fetch("/api/vault/upload", { method: "POST", body: fd });
      setUploadProgress({ done: Math.min(i + batchSize, total), total });
    }

    qc.invalidateQueries({ queryKey: ["/api/vault/items"] });
    setDesc(""); setTags(""); setCategory("general");
    setSelectedFiles([]);
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
        <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">📤 Nahrat obsah</p>
        <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" multiple
          onChange={handleFileSelect}
          data-testid="input-vault-file"
          className="w-full text-sm text-neutral-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 file:cursor-pointer" />
        {selectedFiles.length > 0 && (
          <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-2 space-y-1">
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest px-1">
              Vybrano: {selectedFiles.length} souboru ({(selectedFiles.reduce((s, f) => s + f.size, 0) / (1024 * 1024)).toFixed(1)} MB)
            </p>
            <div className="flex flex-wrap gap-1">
              {selectedFiles.map((f, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 text-[10px] bg-neutral-700 text-neutral-300 px-2 py-1 rounded-lg">
                  {f.type.startsWith("image") ? "📸" : f.type.startsWith("video") ? "🎬" : "🎵"} {f.name.length > 20 ? f.name.slice(0, 17) + "..." : f.name}
                  <button onClick={() => removeFile(idx)} className="text-neutral-500 hover:text-red-400 ml-0.5">×</button>
                </span>
              ))}
            </div>
          </div>
        )}
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Popis (volitelne)"
          data-testid="input-vault-description"
          className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500" />
        <div className="flex gap-2">
          <input value={tags} onChange={e => setTags(e.target.value)} placeholder="Tagy (oddelene carkou)"
            data-testid="input-vault-tags"
            className="flex-1 bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500" />
          <select value={category} onChange={e => setCategory(e.target.value)} data-testid="select-vault-category"
            className="bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-2 text-sm outline-none">
            {CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <button onClick={handleUpload} disabled={uploading || selectedFiles.length === 0} data-testid="button-vault-upload"
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
          {uploading
            ? `⏳ Nahravam ${uploadProgress.done}/${uploadProgress.total}...`
            : selectedFiles.length > 1
            ? `📤 Nahrat ${selectedFiles.length} souboru`
            : "📤 Nahrat"}
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

export default function ManagerDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<"customers" | "vault" | "trends" | "broadcast">("customers");
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
    { id: "customers" as const, icon: "👥", label: "Zákazníci" },
    { id: "vault" as const, icon: "📦", label: "Vault" },
    { id: "trends" as const, icon: "📊", label: "Trendy" },
    { id: "broadcast" as const, icon: "📢", label: "Broadcast" },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <div className="border-b border-neutral-800 bg-neutral-900/80 backdrop-blur px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🧠</span>
          <div>
            <h1 className="font-bold text-sm leading-none" data-testid="text-dashboard-title">AI Manager</h1>
            <p className="text-neutral-500 text-[10px]">{groupUsers(users).length} zakazniku ({users.length} relaci)</p>
          </div>
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
        {activeTab === "customers" && <CustomersTab users={users} qc={qc} />}
        {activeTab === "vault" && <VaultTab />}
        {activeTab === "trends" && <TrendsTab />}
        {activeTab === "broadcast" && <BroadcastTab />}
      </div>
    </div>
  );
}

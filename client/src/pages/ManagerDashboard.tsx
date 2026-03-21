import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";
import { useLocation } from "wouter";

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

const STATUS_CONFIG = {
  hot:  { label: "🔥 Horký",   bg: "bg-red-500/20",    border: "border-red-500/40",    text: "text-red-400" },
  warm: { label: "⚡ Teplý",   bg: "bg-orange-500/20", border: "border-orange-500/40", text: "text-orange-400" },
  cold: { label: "❄️ Studený", bg: "bg-blue-500/20",   border: "border-blue-500/40",   text: "text-blue-400" },
  new:  { label: "🌱 Nový",    bg: "bg-neutral-700/40",border: "border-neutral-600",   text: "text-neutral-400" },
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
          <h1 className="text-xl font-bold text-white">AI Manager</h1>
          <p className="text-neutral-500 text-sm mt-1">Autonomní správce agentury</p>
        </div>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === "Enter" && login()} placeholder="Owner heslo"
          className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-3 outline-none focus:border-emerald-500 transition-colors" />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button onClick={login} disabled={!pw.trim()}
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
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="text-[10px] text-neutral-600 hover:text-emerald-400 transition-colors ml-2 shrink-0">
      {copied ? "✓ Zkopírováno" : "Kopírovat"}
    </button>
  );
}

export default function ManagerDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [filter, setFilter] = useState<"all" | "hot" | "warm" | "cold" | "new">("all");
  const qc = useQueryClient();

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => setAuthed(d.role === "owner"));
  }, []);

  const { data: users = [], isLoading } = useQuery<ManagerUser[]>({
    queryKey: ["/api/manager/overview"],
    enabled: authed === true,
    refetchInterval: 20000,
    queryFn: () => fetch("/api/manager/overview").then(r => r.json()),
  });

  const analyzeMut = useMutation({
    mutationFn: async (userId: number) => {
      setAnalyzingId(userId);
      const res = await fetch(`/api/manager/analyze/${userId}`, { method: "POST" });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/manager/overview"] });
      setAnalyzingId(null);
    },
    onError: () => setAnalyzingId(null),
  });

  const analyzeAll = async () => {
    setBatchRunning(true);
    await fetch("/api/manager/analyze-all", { method: "POST" });
    setTimeout(() => {
      qc.invalidateQueries({ queryKey: ["/api/manager/overview"] });
      setBatchRunning(false);
    }, 15000);
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthed(false);
  };

  if (authed === null) return <div className="min-h-screen bg-neutral-950 flex items-center justify-center"><div className="text-neutral-600">Načítám...</div></div>;
  if (authed === false) return <LoginForm onSuccess={() => { setAuthed(true); window.location.reload(); }} />;

  const filtered = filter === "all" ? users : users.filter(u => (u.aiProfile?.status || "new") === filter);
  const selectedUser = users.find(u => u.id === selectedId);

  const counts = {
    all: users.length,
    hot: users.filter(u => u.aiProfile?.status === "hot").length,
    warm: users.filter(u => u.aiProfile?.status === "warm").length,
    cold: users.filter(u => u.aiProfile?.status === "cold").length,
    new: users.filter(u => !u.aiProfile || u.aiProfile.status === "new").length,
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-neutral-800 bg-neutral-900/80 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🧠</span>
          <div>
            <h1 className="font-bold leading-none">AI Manager</h1>
            <p className="text-neutral-500 text-xs">Autonomní správce agentury · {users.length} zákazníků</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={analyzeAll} disabled={batchRunning}
            className={`text-xs px-4 py-2 rounded-xl font-bold transition-colors ${batchRunning ? "bg-neutral-700 text-neutral-500" : "bg-emerald-600 hover:bg-emerald-500 text-white"}`}>
            {batchRunning ? "⏳ Analyzuji..." : "⚡ Analyzovat vše"}
          </button>
          <button onClick={logout} className="text-neutral-500 hover:text-white text-sm transition-colors">Odhlásit</button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-4 py-3 border-b border-neutral-800 bg-neutral-900/40 overflow-x-auto">
        {(["all", "hot", "warm", "cold", "new"] as const).map(f => (
          <button key={f} onClick={() => { setFilter(f); setSelectedId(null); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${filter === f ? "bg-neutral-700 text-white" : "text-neutral-500 hover:text-neutral-300"}`}>
            {f === "all" ? `Vše (${counts.all})` : f === "hot" ? `🔥 Horký (${counts.hot})` : f === "warm" ? `⚡ Teplý (${counts.warm})` : f === "cold" ? `❄️ Studený (${counts.cold})` : `🌱 Nový (${counts.new})`}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* User list */}
        <div className={`w-full md:w-96 border-r border-neutral-800 flex flex-col overflow-hidden ${selectedId !== null ? "hidden md:flex" : "flex"}`}>
          {isLoading && (
            <div className="flex-1 flex items-center justify-center text-neutral-600 text-sm">Načítám zákazníky...</div>
          )}
          <div className="flex-1 overflow-y-auto">
            {filtered.map(user => {
              const profile = user.aiProfile;
              const cfg = STATUS_CONFIG[profile?.status || "new"];
              return (
                <button key={user.id} onClick={() => setSelectedId(user.id)}
                  className={`w-full text-left px-4 py-4 border-b border-neutral-800/50 hover:bg-neutral-800/40 transition-colors ${selectedId === user.id ? "bg-neutral-800" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border shrink-0 ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                        {user.name[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{user.name}</p>
                        <p className="text-xs text-neutral-500">
                          {user.totalMessages} zpráv · {user.lastActivity ? formatDistanceToNow(new Date(user.lastActivity), { locale: cs, addSuffix: true }) : "bez aktivity"}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right space-y-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                        {profile?.statusLabel || "Nový"}
                      </span>
                      {profile && (
                        <div className="w-16">
                          <ScoreBar score={profile.engagementScore} />
                          <p className="text-[9px] text-neutral-600 text-right mt-0.5">{profile.engagementScore}%</p>
                        </div>
                      )}
                    </div>
                  </div>
                  {profile?.nextAction && (
                    <p className="text-[11px] text-emerald-500/80 mt-2 pl-13 line-clamp-1">
                      💡 {profile.nextAction}
                    </p>
                  )}
                </button>
              );
            })}
            {!isLoading && filtered.length === 0 && (
              <div className="text-center text-neutral-600 py-12 text-sm">Žádní zákazníci v této kategorii</div>
            )}
          </div>
        </div>

        {/* Profile detail */}
        <div className={`flex-1 flex flex-col overflow-hidden ${selectedId === null ? "hidden md:flex" : "flex"}`}>
          {!selectedUser ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4">
              <div className="text-5xl">🧠</div>
              <div>
                <p className="text-white font-bold text-lg">AI Manager je připraven</p>
                <p className="text-neutral-500 text-sm mt-1">Vyber zákazníka ze seznamu<br/>nebo klikni "Analyzovat vše" pro batch analýzu</p>
              </div>
              {users.filter(u => !u.aiProfile).length > 0 && (
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-400">
                  {users.filter(u => !u.aiProfile).length} zákazníků ještě nebylo analyzováno
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* Profile header */}
              <div className="sticky top-0 border-b border-neutral-800 px-4 py-3 bg-neutral-950/95 backdrop-blur flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedId(null)} className="md:hidden text-neutral-500 hover:text-white text-lg">←</button>
                  {(() => {
                    const profile = selectedUser.aiProfile;
                    const cfg = STATUS_CONFIG[profile?.status || "new"];
                    return (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                        {selectedUser.name[0]?.toUpperCase()}
                      </div>
                    );
                  })()}
                  <div>
                    <p className="font-bold">{selectedUser.name}</p>
                    <p className="text-xs text-neutral-500">
                      {selectedUser.aiProfile ? `Analyzován ${formatDistanceToNow(new Date(selectedUser.aiProfile.lastAnalyzed), { locale: cs, addSuffix: true })}` : "Neanalyzován"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => analyzeMut.mutate(selectedUser.id)}
                  disabled={analyzingId === selectedUser.id}
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold transition-colors">
                  {analyzingId === selectedUser.id ? "⏳ Analyzuji..." : selectedUser.aiProfile ? "🔄 Znovu" : "🧠 Analyzovat"}
                </button>
              </div>

              {!selectedUser.aiProfile ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center gap-4">
                  <p className="text-neutral-500 text-sm">Zákazník ještě nebyl analyzován</p>
                  <button onClick={() => analyzeMut.mutate(selectedUser.id)} disabled={analyzingId === selectedUser.id}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-colors">
                    {analyzingId === selectedUser.id ? "⏳ Analyzuji..." : "Spustit analýzu"}
                  </button>
                </div>
              ) : (
                <div className="p-4 md:p-6 space-y-5">
                  {/* Status + score */}
                  {(() => {
                    const p = selectedUser.aiProfile!;
                    const cfg = STATUS_CONFIG[p.status];
                    return (
                      <>
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-bold px-3 py-1.5 rounded-xl border ${cfg.bg} ${cfg.border} ${cfg.text}`}>{cfg.label}</span>
                          <span className="text-neutral-500 text-sm">·</span>
                          <span className="text-sm text-neutral-400">Potenciál: <strong className={p.buyingPotential === "vysoký" ? "text-red-400" : p.buyingPotential === "střední" ? "text-orange-400" : "text-blue-400"}>{p.buyingPotential}</strong></span>
                        </div>

                        <div>
                          <div className="flex justify-between text-xs text-neutral-500 mb-1">
                            <span>Engagement skóre</span>
                            <span className="font-bold">{p.engagementScore}/100</span>
                          </div>
                          <ScoreBar score={p.engagementScore} />
                        </div>

                        {/* Summary */}
                        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                          <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">📋 Profil</p>
                          <p className="text-sm text-neutral-300 leading-relaxed">{p.summary}</p>
                        </div>

                        {/* Personality + interests */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">🎭 Osobnost</p>
                            <div className="flex flex-wrap gap-1.5">
                              {p.personality.map((t, i) => <span key={i} className="text-xs bg-neutral-800 text-neutral-300 px-2 py-1 rounded-lg">{t}</span>)}
                              {p.personality.length === 0 && <span className="text-xs text-neutral-600">-</span>}
                            </div>
                          </div>
                          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">❤️ Zájmy</p>
                            <div className="flex flex-wrap gap-1.5">
                              {p.interests.map((t, i) => <span key={i} className="text-xs bg-pink-500/20 border border-pink-500/30 text-pink-400 px-2 py-1 rounded-lg">{t}</span>)}
                              {p.interests.length === 0 && <span className="text-xs text-neutral-600">-</span>}
                            </div>
                          </div>
                        </div>

                        {/* Next action */}
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                          <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-2">💡 Doporučená akce</p>
                          <p className="text-sm text-emerald-300 leading-relaxed">{p.nextAction}</p>
                        </div>

                        {/* Suggested messages */}
                        {p.suggestedMessages.length > 0 && (
                          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">✍️ Navrhované zprávy</p>
                            <div className="space-y-2">
                              {p.suggestedMessages.map((msg, i) => (
                                <div key={i} className="flex items-start justify-between gap-2 bg-neutral-800/60 rounded-lg px-3 py-2.5">
                                  <p className="text-sm text-white leading-relaxed">{msg}</p>
                                  <CopyButton text={msg} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Content ideas */}
                        {p.contentIdeas.length > 0 && (
                          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">🎬 Nápady na content</p>
                            <div className="space-y-2">
                              {p.contentIdeas.map((idea, i) => (
                                <div key={i} className="flex items-start gap-2">
                                  <span className="text-pink-500 mt-0.5">→</span>
                                  <p className="text-sm text-neutral-300">{idea}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Warnings */}
                        {p.warnings.length > 0 && (
                          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                            <p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-2">⚠️ Varování</p>
                            {p.warnings.map((w, i) => <p key={i} className="text-sm text-red-300">{w}</p>)}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

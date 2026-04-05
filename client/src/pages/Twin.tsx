import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Zap, Lock, Unlock, Sparkles, Users, Settings, BarChart3, Bot, User } from "lucide-react";
import ninnaImg from "@assets/IMG_6506_1775388955437.jpeg";

export default function Twin() {
  const { userId, user } = useAuth();
  const [, setLocation] = useLocation();
  const [twin, setTwin] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [skins, setSkins] = useState<any[]>([]);
  const [selectedSkin, setSelectedSkin] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [applySkinLoading, setApplySkinLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    
    (async () => {
      try {
        const [twinRes, subRes, skinsRes] = await Promise.all([
          fetch(`/api/twin/${userId}`),
          fetch(`/api/subscription/${userId}`),
          fetch(`/api/twin/${userId}/skins`),
        ]);

        if (twinRes.ok) setTwin(await twinRes.json());
        if (subRes.ok) setSubscription(await subRes.json());
        if (skinsRes.ok) setSkins(await skinsRes.json());
      } catch (err) {
        console.error("Twin load error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 relative">
            <Sparkles className="w-full h-full animate-spin text-pink-500" />
          </div>
          <p>Probouzím tvoji Ninnu...</p>
        </div>
      </div>
    );
  }

  if (!subscription || subscription.status !== "active") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <Lock className="w-20 h-20 mx-auto mb-6 text-pink-500 animate-pulse" />
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
            Virtuální Ninna čeká
          </h1>
          <p className="text-gray-300 mb-8 text-lg">
            Aktivuj si předplatné a proveď si svou Ninnu do firmy!
          </p>
          <Button className="bg-gradient-to-r from-pink-500 to-purple-600 w-full text-lg py-6" onClick={() => setLocation("/chat")}>
            Koupit Předplatné
          </Button>
        </div>
      </div>
    );
  }

  const handleApplySkin = async () => {
    if (!selectedSkin || applySkinLoading) return;
    setApplySkinLoading(true);
    try {
      await fetch(`/api/twin/${userId}/apply-skin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skinId: selectedSkin.id }),
      });
      setSelectedSkin(null);
    } catch (err) {
      console.error("Apply skin error:", err);
    } finally {
      setApplySkinLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Tvá Virtuální Ninna</h1>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${isOnline ? "bg-green-500 animate-pulse" : "bg-gray-500"}`} />
                  <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: isOnline ? "#22c55e" : "#9ca3af" }}>
                    {isOnline ? "NYNÍ ONLINE" : "OFFLINE"}
                  </span>
                </div>
                <span className="text-gray-400">•</span>
                <div className="flex items-center gap-1 text-amber-400">
                  <Zap className="w-4 h-4" />
                  <span className="text-sm font-medium">{subscription?.tierName || "Aktivní"}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setIsOnline(!isOnline)} className="text-xs px-3 py-1 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300 transition">
                {isOnline ? "Offline" : "Online"}
              </button>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-12">
          {/* Avatar Section - Large Center */}
          <div className="xl:col-span-2">
            <Card className="bg-gradient-to-br from-gray-800/50 to-purple-900/30 border-pink-500/30 overflow-hidden">
              <div className="relative aspect-square md:aspect-auto md:h-[500px] flex items-center justify-center bg-gradient-to-t from-purple-900/40 to-transparent">
                {/* Avatar */}
                <div className="relative w-full h-full flex items-center justify-center">
                  <img
                    src={ninnaImg}
                    alt="Ninna Twin"
                    className="w-full h-full object-cover"
                  />
                  {/* Overlay shine effect */}
                  <div className="absolute inset-0 bg-gradient-to-t from-purple-900/50 via-transparent to-transparent pointer-events-none" />
                  
                  {/* Status Badge */}
                  <div className="absolute top-4 right-4 bg-green-500/20 border border-green-500/50 rounded-full px-4 py-2 backdrop-blur-sm">
                    <span className="text-xs font-bold text-green-300 uppercase tracking-widest">● Online</span>
                  </div>

                  {/* Name Badge */}
                  <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 text-center">
                    <h2 className="text-3xl font-black text-white drop-shadow-lg">
                      Ninna <span className="text-pink-400">Ray</span>
                    </h2>
                    <p className="text-pink-300 font-semibold text-sm mt-1">Tvá Agentura AI</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Controls Sidebar */}
          <div className="space-y-4">
            {/* Quick Access */}
            <Card className="bg-gray-800/40 border-purple-500/30 p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                Přístup
              </h3>
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start bg-gray-700/50 hover:bg-gray-700 border-gray-600 text-white"
                  onClick={() => setLocation("/agent")}
                  data-testid="button-agent-dashboard"
                >
                  <User className="w-4 h-4 mr-2" />
                  Agent Dashboard
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start bg-gray-700/50 hover:bg-gray-700 border-gray-600 text-white"
                  onClick={() => setLocation("/manager")}
                  data-testid="button-manager-dashboard"
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Manager Control
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start bg-gray-700/50 hover:bg-gray-700 border-gray-600 text-white"
                  onClick={() => setLocation("/admin")}
                  data-testid="button-admin-dashboard"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Owner Panel
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start bg-gray-700/50 hover:bg-gray-700 border-gray-600 text-white"
                  onClick={() => setLocation("/bot")}
                  data-testid="button-ebot"
                >
                  <Bot className="w-4 h-4 mr-2" />
                  E-Bot Training
                </Button>
              </div>
            </Card>

            {/* Stats */}
            <Card className="bg-gray-800/40 border-purple-500/30 p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                Schopnosti
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-gray-700/50">
                  <span className="text-sm text-gray-300">Úroveň</span>
                  <span className="font-bold text-pink-400">{subscription?.capabilityLevel || 1}/4</span>
                </div>
                {[
                  { level: 1, label: "Základní AI", icon: Sparkles },
                  { level: 2, label: "Doporučení", icon: BarChart3 },
                  { level: 3, label: "Autonomní", icon: Bot },
                  { level: 4, label: "Vedoucí týmu", icon: Users },
                ].map((cap) => (
                  <div key={cap.level} className="flex items-center gap-2">
                    {(subscription?.capabilityLevel || 0) >= cap.level ? (
                      <>
                        <Unlock className="w-4 h-4 text-green-400" />
                        <span className="text-sm text-gray-300">{cap.label}</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4 text-gray-500" />
                        <span className="text-sm text-gray-500">{cap.label}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* Chat */}
            <Button
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold py-6 text-lg"
              onClick={() => setLocation("/chat")}
              data-testid="button-chat"
            >
              💬 Psát Ninně
            </Button>
          </div>
        </div>

        {/* Wardrobe Section */}
        {skins.length > 0 && (
          <div>
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
                <Sparkles className="w-7 h-7 text-purple-400" />
                Tvůj Šatník
              </h2>
              <p className="text-gray-400">Vyber si vzhled a zbarvení pro svou Ninnu</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {skins.map((skin) => (
                <button
                  key={skin.id}
                  onClick={() => setSelectedSkin(skin)}
                  className={`relative rounded-xl overflow-hidden border-2 transition-all duration-200 ${
                    selectedSkin?.id === skin.id
                      ? "border-pink-500 scale-105 ring-2 ring-pink-400/50"
                      : "border-gray-700 hover:border-pink-500/50"
                  }`}
                  data-testid={`skin-${skin.id}`}
                >
                  {skin.previewUrl || skin.url ? (
                    <img
                      src={skin.previewUrl || skin.url}
                      alt={skin.name}
                      className="w-full aspect-square object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-square bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                      <span className="text-xs text-gray-400 text-center px-2">{skin.name}</span>
                    </div>
                  )}
                  {selectedSkin?.id === skin.id && (
                    <div className="absolute inset-0 bg-pink-500/20 flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-pink-300 animate-bounce" />
                    </div>
                  )}
                </button>
              ))}
            </div>

            {selectedSkin && (
              <div className="mt-8 p-6 bg-gray-800/50 rounded-xl border border-pink-500/30">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">{selectedSkin.name}</h3>
                    <p className="text-gray-400 text-sm">{selectedSkin.description || "Přizpůsob si vzhled své Ninny"}</p>
                  </div>
                  <div className="flex gap-4">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedSkin(null)}
                      className="border-gray-600 text-gray-300 hover:bg-gray-700"
                      data-testid="button-cancel-skin"
                    >
                      Zrušit
                    </Button>
                    <Button
                      onClick={handleApplySkin}
                      disabled={applySkinLoading}
                      className="bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold"
                      data-testid="button-apply-skin"
                    >
                      {applySkinLoading ? "Aplikuji..." : "✨ Aplikovat Vzhled"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {skins.length === 0 && (
          <div className="text-center py-16 bg-gray-800/30 rounded-xl border border-purple-500/20">
            <Lock className="w-16 h-16 mx-auto mb-4 text-purple-400 opacity-50" />
            <h3 className="text-xl font-bold text-white mb-2">Šatník je prázdný</h3>
            <p className="text-gray-400 mb-6">Koupi si obsah v chatu a odemkneš si nové vzhleды pro svou Ninnu!</p>
            <Button
              onClick={() => setLocation("/chat")}
              className="bg-gradient-to-r from-pink-500 to-purple-600"
              data-testid="button-buy-content"
            >
              Koupit v Chatu
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

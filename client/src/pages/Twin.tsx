import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Zap, Lock, Unlock } from "lucide-react";

export default function Twin() {
  const { userId } = useAuth();
  const [twin, setTwin] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [skins, setSkins] = useState<any[]>([]);
  const [selectedSkin, setSelectedSkin] = useState<any>(null);

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
      <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 flex items-center justify-center text-white">
        <p>Načítám tvé virtuální dvojče...</p>
      </div>
    );
  }

  if (!subscription || subscription.status !== "active") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 flex items-center justify-center text-white px-6">
        <div className="text-center max-w-md">
          <Lock className="w-16 h-16 mx-auto mb-6 text-pink-500" />
          <h1 className="text-3xl font-bold mb-4">Odemkni své Virtuální Dvojče</h1>
          <p className="text-gray-400 mb-8">
            Virtuální Dvojče je dostupné pouze pro předplatitele. Vyber si svůj plán a začni!
          </p>
          <Button className="bg-gradient-to-r from-pink-500 to-purple-600 w-full">
            Koupit Předplatné
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Tvé Virtuální Dvojče</h1>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            <p className="text-gray-400">{subscription.tierName}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Twin Avatar */}
          <div className="md:col-span-2">
            <div className="bg-gray-800/50 rounded-xl border border-pink-500/30 p-8 aspect-square flex items-center justify-center">
              <div className="text-center">
                {twin?.visualConfig?.baseAvatarId ? (
                  <img
                    src={`/api/twin/avatar/${twin.visualConfig.baseAvatarId}`}
                    alt="Twin Avatar"
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <div className="text-gray-500">
                    <p className="mb-4">Tvé Mini-Já</p>
                    <p className="text-sm">Přizpůsob si tvé dvojče pomocí odemčených fotek</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Capability Level */}
          <div className="bg-gray-800/50 rounded-xl border border-purple-500/30 p-6">
            <h3 className="text-lg font-bold text-white mb-4">Schopnosti</h3>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="flex items-center gap-2">
                <Unlock className="w-4 h-4 text-green-400" />
                <span>Odemčené fotky</span>
              </div>
              {subscription.capabilityLevel >= 2 && (
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <span>Aktivní doporučení</span>
                </div>
              )}
              {subscription.capabilityLevel >= 3 && (
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-pink-400" />
                  <span>Prioritní podpora</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Skins / Wardrobe */}
        {skins.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">Šatník</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {skins.map((skin) => (
                <button
                  key={skin.id}
                  onClick={() => setSelectedSkin(skin)}
                  className={`rounded-lg overflow-hidden border-2 transition-all ${
                    selectedSkin?.id === skin.id
                      ? "border-pink-500 scale-105"
                      : "border-gray-700 hover:border-pink-500/50"
                  }`}
                >
                  {skin.previewUrl ? (
                    <img
                      src={skin.previewUrl}
                      alt={skin.name}
                      className="w-full aspect-square object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-square bg-gray-700 flex items-center justify-center">
                      <span className="text-xs text-gray-400">{skin.name}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {selectedSkin && (
              <Button
                className="mt-6 bg-gradient-to-r from-pink-500 to-purple-600 w-full"
                onClick={async () => {
                  await fetch(`/api/twin/${userId}/apply-skin`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ skinId: selectedSkin.id }),
                  });
                  setSelectedSkin(null);
                }}
              >
                Aplikovat vzhled
              </Button>
            )}
          </div>
        )}

        {skins.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Lock className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Koupi si fotky v chatu a odemkneš si nové prvky do šatníku!</p>
          </div>
        )}
      </div>
    </div>
  );
}

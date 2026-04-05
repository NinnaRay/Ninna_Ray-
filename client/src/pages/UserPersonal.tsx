import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Lock, Sparkles, Heart, MessageSquare, Zap, Settings, LogOut } from "lucide-react";
import ninnaImg from "@assets/IMG_6506_1775388955437.jpeg";

interface PersonalizationPrefs {
  style: "professional" | "casual" | "fun" | "premium";
  expectations: string[];
  features: string[];
}

const STYLE_OPTIONS = {
  professional: { label: "Profesionální", emoji: "👔", desc: "Business-ready, elegantní" },
  casual: { label: "Přítelský", emoji: "😊", desc: "Relaxovaný, přátelský" },
  fun: { label: "Zábavný", emoji: "🎉", desc: "Energetický, vtipný" },
  premium: { label: "Luxusní", emoji: "✨", desc: "Exkluzivní, VIP" },
};

const EXPECTATIONS = [
  { id: "daily", label: "Denní kontakt", emoji: "📱" },
  { id: "advice", label: "Rady a tipy", emoji: "💡" },
  { id: "support", label: "Emoční podpora", emoji: "💗" },
  { id: "fun", label: "Zábava", emoji: "🎮" },
  { id: "business", label: "Business help", emoji: "📊" },
  { id: "creative", label: "Kreativní nápady", emoji: "🎨" },
];

const FEATURES = [
  { id: "ai-reply", label: "AI odpovědi", emoji: "🤖" },
  { id: "voice", label: "Hlasové zprávy", emoji: "🎙️" },
  { id: "photos", label: "Exkluzivní fotky", emoji: "📸" },
  { id: "tasks", label: "Todo list", emoji: "✅" },
  { id: "calendar", label: "Kalendář", emoji: "📅" },
  { id: "stats", label: "Statistiky", emoji: "📈" },
];

export default function UserPersonal() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [isSetup, setIsSetup] = useState(false);
  const [prefs, setPrefs] = useState<PersonalizationPrefs>({
    style: "premium",
    expectations: ["daily", "advice"],
    features: ["ai-reply", "photos"],
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Simulate checking if user has active subscription
    const hasSubscription = localStorage.getItem("has_subscription");
    if (!hasSubscription && user?.id) {
      // Redirect to payment if not subscribed
      setLocation("/payment");
    }
  }, [user, setLocation]);

  const toggleExpectation = (id: string) => {
    setPrefs(prev => ({
      ...prev,
      expectations: prev.expectations.includes(id)
        ? prev.expectations.filter(e => e !== id)
        : [...prev.expectations, id],
    }));
  };

  const toggleFeature = (id: string) => {
    setPrefs(prev => ({
      ...prev,
      features: prev.features.includes(id)
        ? prev.features.filter(f => f !== id)
        : [...prev.features, id],
    }));
  };

  const savePreferences = async () => {
    setIsSaving(true);
    // Simulace uložení
    setTimeout(() => {
      setIsSetup(true);
      setIsSaving(false);
      localStorage.setItem("user_prefs", JSON.stringify(prefs));
    }, 800);
  };

  if (!user) return null;

  if (isSetup) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold text-white">Tvá Personalizovaná Ninna</h1>
              <p className="text-gray-400">Nastaveno přesně tak, jak jsi si přál/a ✨</p>
            </div>
            <Button
              variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
              onClick={() => logout.mutate()}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Odhlásit
            </Button>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-12">
            {/* Personal Avatar */}
            <div className="xl:col-span-2">
              <Card className="bg-gradient-to-br from-gray-800/50 to-purple-900/30 border-pink-500/30 overflow-hidden">
                <div className="relative h-[600px] flex items-center justify-center bg-gradient-to-t from-purple-900/40 to-transparent">
                  <img src={ninnaImg} alt="Tvá Ninna" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none" />

                  {/* Style Badge */}
                  <div className="absolute top-4 right-4 bg-purple-500/20 border border-purple-500/50 rounded-full px-4 py-2">
                    <span className="text-lg">{STYLE_OPTIONS[prefs.style].emoji}</span>
                    <span className="text-xs font-bold text-purple-300 ml-2 uppercase">
                      {STYLE_OPTIONS[prefs.style].label}
                    </span>
                  </div>

                  {/* Personalized Info */}
                  <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 text-center">
                    <h2 className="text-3xl font-black text-white drop-shadow-lg">
                      Ninna <span className="text-pink-400">pro {user.firstName || "tebe"}</span>
                    </h2>
                    <div className="flex justify-center gap-2 mt-3 text-sm text-gray-200">
                      {prefs.expectations.map((e) => (
                        <span key={e} className="px-2 py-1 bg-white/10 rounded">
                          {EXPECTATIONS.find(x => x.id === e)?.emoji}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                <Card className="bg-gray-800/40 border-purple-500/30 p-4 text-center">
                  <Heart className="w-6 h-6 mx-auto mb-2 text-pink-500" />
                  <div className="text-2xl font-bold text-white">100%</div>
                  <div className="text-xs text-gray-400">Kompatibilita</div>
                </Card>
                <Card className="bg-gray-800/40 border-purple-500/30 p-4 text-center">
                  <Zap className="w-6 h-6 mx-auto mb-2 text-yellow-500" />
                  <div className="text-2xl font-bold text-white">24/7</div>
                  <div className="text-xs text-gray-400">Dostupnost</div>
                </Card>
                <Card className="bg-gray-800/40 border-purple-500/30 p-4 text-center">
                  <MessageSquare className="w-6 h-6 mx-auto mb-2 text-blue-500" />
                  <div className="text-2xl font-bold text-white">∞</div>
                  <div className="text-xs text-gray-400">Zprávy</div>
                </Card>
              </div>
            </div>

            {/* Personalization Summary */}
            <div className="space-y-4">
              <Card className="bg-gray-800/40 border-purple-500/30 p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  Tvoje Nastavení
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-bold text-gray-300 block mb-2">Styl</label>
                    <div className="px-3 py-2 bg-gray-700/50 rounded text-white text-sm">
                      {STYLE_OPTIONS[prefs.style].emoji} {STYLE_OPTIONS[prefs.style].label}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-bold text-gray-300 block mb-2">Očekávání</label>
                    <div className="flex flex-wrap gap-2">
                      {prefs.expectations.map((e) => {
                        const exp = EXPECTATIONS.find(x => x.id === e);
                        return (
                          <span key={e} className="px-2 py-1 bg-pink-500/30 border border-pink-500/50 rounded text-xs text-pink-300">
                            {exp?.emoji} {exp?.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-bold text-gray-300 block mb-2">Funkce ({prefs.features.length})</label>
                    <div className="space-y-1">
                      {prefs.features.map((f) => {
                        const feat = FEATURES.find(x => x.id === f);
                        return (
                          <div key={f} className="flex items-center gap-2 text-sm text-gray-300">
                            <span className="text-lg">{feat?.emoji}</span>
                            <span>{feat?.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Card>

              <Button
                className="w-full bg-gradient-to-r from-pink-500 to-purple-600 font-bold py-6"
                onClick={() => setLocation("/chat")}
                data-testid="button-start-chat"
              >
                💬 Začít chatovat s Ninnou
              </Button>

              <Button
                variant="outline"
                className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
                onClick={() => setIsSetup(false)}
                data-testid="button-edit-prefs"
              >
                ⚙️ Upravit nastavení
              </Button>
            </div>
          </div>

          {/* Feature Overview */}
          <Card className="bg-gray-800/40 border-purple-500/30 p-6">
            <h2 className="text-2xl font-bold text-white mb-6">Co máš k dispozici</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: "💭", title: "AI Rozhovory", desc: "Přesně podle tvojích potřeb" },
                { icon: "📸", title: "Exkluzivní Obsah", desc: "Pouze pro tebe připraveno" },
                { icon: "🎯", title: "Personalizace", desc: "Nastavit si cokoliv chceš" },
              ].map((item, i) => (
                <div key={i} className="p-4 bg-gray-700/30 rounded-lg">
                  <div className="text-3xl mb-2">{item.icon}</div>
                  <h3 className="font-bold text-white mb-1">{item.title}</h3>
                  <p className="text-sm text-gray-400">{item.desc}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Setup Mode
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Vítej! 🎉</h1>
          <p className="text-gray-400 text-lg">Personalizuj si svou Ninnu podle svých přání</p>
        </div>

        <Card className="bg-gray-800/50 border-purple-500/30 p-8 mb-8">
          {/* Style Selection */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-white mb-6">1️⃣ Vyber si styl interakce</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(STYLE_OPTIONS).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setPrefs(prev => ({ ...prev, style: key as any }))}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    prefs.style === key
                      ? "border-pink-500 bg-pink-500/10"
                      : "border-gray-700 hover:border-pink-500/50 bg-gray-700/30"
                  }`}
                  data-testid={`style-${key}`}
                >
                  <div className="text-4xl mb-2">{val.emoji}</div>
                  <div className="font-bold text-white text-sm">{val.label}</div>
                  <div className="text-xs text-gray-400">{val.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Expectations */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-white mb-6">2️⃣ Co od ní očekáváš? (vyber více)</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {EXPECTATIONS.map((exp) => (
                <button
                  key={exp.id}
                  onClick={() => toggleExpectation(exp.id)}
                  className={`p-3 rounded-lg border-2 transition-all text-left ${
                    prefs.expectations.includes(exp.id)
                      ? "border-pink-500 bg-pink-500/10"
                      : "border-gray-700 hover:border-pink-500/50 bg-gray-700/30"
                  }`}
                  data-testid={`expectation-${exp.id}`}
                >
                  <span className="text-lg">{exp.emoji}</span>
                  <div className="font-bold text-white text-sm">{exp.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Features */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-white mb-6">3️⃣ Jaké funkce chceš? (vyber své)</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {FEATURES.map((feat) => (
                <button
                  key={feat.id}
                  onClick={() => toggleFeature(feat.id)}
                  className={`p-3 rounded-lg border-2 transition-all text-left ${
                    prefs.features.includes(feat.id)
                      ? "border-purple-500 bg-purple-500/10"
                      : "border-gray-700 hover:border-purple-500/50 bg-gray-700/30"
                  }`}
                  data-testid={`feature-${feat.id}`}
                >
                  <span className="text-lg">{feat.emoji}</span>
                  <div className="font-bold text-white text-sm">{feat.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex gap-4">
            <Button
              onClick={savePreferences}
              disabled={isSaving}
              className="flex-1 bg-gradient-to-r from-pink-500 to-purple-600 font-bold py-6"
              data-testid="button-save-prefs"
            >
              {isSaving ? "Ukládám..." : "✨ Uložit a pokračovat"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

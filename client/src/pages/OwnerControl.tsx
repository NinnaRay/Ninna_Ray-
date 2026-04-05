import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Lock, LogOut, Zap, Users, TrendingUp, Radio } from "lucide-react";
import ninnaImg from "@assets/IMG_6506_1775388955437.jpeg";

const OWNER_PASSWORD = "ninna2024";

export default function OwnerControl() {
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [ninnaStatus, setNinnaStatus] = useState({
    isLive: true,
    activeUsers: 23,
    todayRevenue: 45230,
    messagesSent: 156,
  });
  const [commandInput, setCommandInput] = useState("");
  const [lastCommand, setLastCommand] = useState("");

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === OWNER_PASSWORD) {
      setIsAuthenticated(true);
      setAuthError("");
    } else {
      setAuthError("Chybné heslo!");
      setPassword("");
    }
  };

  const sendCommand = (cmd: string) => {
    setLastCommand(cmd);
    setCommandInput("");
    // Simulace odeslání příkazu Ninně
    setTimeout(() => setLastCommand(""), 3000);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 flex items-center justify-center p-6">
        <Card className="bg-gray-800/50 border-pink-500/30 p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <Lock className="w-12 h-12 mx-auto mb-4 text-pink-500" />
            <h1 className="text-3xl font-bold text-white mb-2">Owner Control</h1>
            <p className="text-gray-400">Přístup pouze pro majitele</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <Input
                type="password"
                placeholder="Heslo"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-500"
                data-testid="input-password"
              />
              {authError && (
                <p className="text-red-400 text-sm mt-2">{authError}</p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 font-bold py-6"
              data-testid="button-login"
            >
              Vstoupit do Kontroly
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white">Tvá Ninna Live</h1>
            <p className="text-gray-400">Majitel - Owner Control Panel</p>
          </div>
          <Button
            variant="outline"
            className="border-gray-600 text-gray-300 hover:bg-gray-700"
            onClick={() => setIsAuthenticated(false)}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Odhlásit se
          </Button>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-12">
          {/* Live Ninna - Center */}
          <div className="xl:col-span-2">
            <Card className="bg-gradient-to-br from-gray-800/50 to-purple-900/30 border-pink-500/30 overflow-hidden">
              <div className="relative h-[600px] flex items-center justify-center bg-gradient-to-t from-purple-900/40 to-transparent">
                {/* Live Indicator */}
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-500/20 border border-red-500/50 rounded-full px-4 py-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-xs font-bold text-red-300 uppercase">🔴 LIVE</span>
                </div>

                {/* Avatar */}
                <img
                  src={ninnaImg}
                  alt="Ninna"
                  className="w-full h-full object-cover"
                />

                {/* Status Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none" />

                {/* Info Badge */}
                <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2">
                  <h2 className="text-3xl font-black text-white drop-shadow-lg">
                    Ninna <span className="text-pink-400">Live</span>
                  </h2>
                  <div className="flex items-center justify-center gap-4 mt-2 text-sm text-gray-200">
                    <span>👥 {ninnaStatus.activeUsers} uživatelů</span>
                    <span>💬 {ninnaStatus.messagesSent} zpráv</span>
                  </div>
                </div>

                {/* Last Command Display */}
                {lastCommand && (
                  <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-white text-black px-4 py-2 rounded-full font-bold text-sm shadow-lg animate-bounce">
                    ✓ {lastCommand}
                  </div>
                )}
              </div>
            </Card>

            {/* Quick Controls */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <Button
                variant="outline"
                className="bg-gray-800/50 border-purple-500/30 text-white hover:bg-gray-700"
                onClick={() => sendCommand("Zavolej agenty")}
                data-testid="button-cmd-call"
              >
                📢 Zavolej
              </Button>
              <Button
                variant="outline"
                className="bg-gray-800/50 border-purple-500/30 text-white hover:bg-gray-700"
                onClick={() => sendCommand("Otevři chat")}
                data-testid="button-cmd-chat"
              >
                💬 Chat
              </Button>
              <Button
                variant="outline"
                className="bg-gray-800/50 border-purple-500/30 text-white hover:bg-gray-700"
                onClick={() => sendCommand("Přijmi call")}
                data-testid="button-cmd-call-accept"
              >
                ☎️ Přijmi
              </Button>
            </div>
          </div>

          {/* Control Panel - Right */}
          <div className="space-y-4">
            {/* Status Stats */}
            <Card className="bg-gray-800/40 border-purple-500/30 p-6">
              <h3 className="text-lg font-bold text-white mb-4">Status</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-300">Stav</span>
                    <span className="text-xs px-2 py-1 bg-green-500/20 text-green-300 rounded">
                      🔴 LIVE
                    </span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-300">Aktivní uživatelé</span>
                    <span className="font-bold text-pink-400">{ninnaStatus.activeUsers}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-pink-500"
                      style={{ width: `${Math.min((ninnaStatus.activeUsers / 100) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-300 flex items-center gap-1">
                      <TrendingUp className="w-4 h-4" /> Dnes
                    </span>
                    <span className="font-bold text-green-400">{ninnaStatus.todayRevenue.toLocaleString()} Kč</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Commands */}
            <Card className="bg-gray-800/40 border-purple-500/30 p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Radio className="w-5 h-5 text-purple-400" />
                Příkazy
              </h3>
              <div className="space-y-2">
                <button
                  onClick={() => sendCommand("Skenej uživatele")}
                  className="w-full p-2 text-left bg-gray-700/50 hover:bg-gray-700 rounded text-sm text-white transition"
                  data-testid="cmd-scan"
                >
                  🔍 Skenej uživatele
                </button>
                <button
                  onClick={() => sendCommand("Zobraz analytics")}
                  className="w-full p-2 text-left bg-gray-700/50 hover:bg-gray-700 rounded text-sm text-white transition"
                  data-testid="cmd-analytics"
                >
                  📊 Zobraz analytics
                </button>
                <button
                  onClick={() => sendCommand("Spusti kampanii")}
                  className="w-full p-2 text-left bg-gray-700/50 hover:bg-gray-700 rounded text-sm text-white transition"
                  data-testid="cmd-campaign"
                >
                  🎯 Spusti kampanii
                </button>
                <button
                  onClick={() => sendCommand("Generuj report")}
                  className="w-full p-2 text-left bg-gray-700/50 hover:bg-gray-700 rounded text-sm text-white transition"
                  data-testid="cmd-report"
                >
                  📄 Generuj report
                </button>
              </div>
            </Card>

            {/* Custom Command */}
            <Card className="bg-gray-800/40 border-purple-500/30 p-4">
              <label className="text-xs font-bold text-gray-400 uppercase block mb-2">
                Vlastní příkaz
              </label>
              <div className="flex gap-2">
                <Input
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  placeholder="Napiš příkaz..."
                  className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-500"
                  data-testid="input-command"
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && commandInput) {
                      sendCommand(commandInput);
                    }
                  }}
                />
                <Button
                  onClick={() => commandInput && sendCommand(commandInput)}
                  className="bg-gradient-to-r from-pink-500 to-purple-600 px-4"
                  data-testid="button-send-cmd"
                >
                  ➤
                </Button>
              </div>
            </Card>
          </div>
        </div>

        {/* Activity Log */}
        <Card className="bg-gray-800/40 border-purple-500/30 p-6">
          <h2 className="text-2xl font-bold text-white mb-4">Aktivita</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded">
              <span className="text-gray-300">Ninna se připojila do chatu</span>
              <span className="text-xs text-gray-500">právě teď</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded">
              <span className="text-gray-300">5 agentů aktivní v live</span>
              <span className="text-xs text-gray-500">před 2 min</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded">
              <span className="text-gray-300">Příchodový odkaz aktivní</span>
              <span className="text-xs text-gray-500">od 12:30</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded">
              <span className="text-gray-300">Poslední zpráva odeslána</span>
              <span className="text-xs text-gray-500">před 45 sec</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";

import ninnaPhoto from "@assets/IMG_4700_1768775323977.jpeg";

export default function Landing() {
  const [, setLocation] = useLocation();
  const [lang, setLang] = useState<"cs" | "en">("cs");
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      const initCustomer = async () => {
        try {
          const res = await fetch("/api/customers/init", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          });
          if (res.ok) {
            const customer = await res.json();
            localStorage.setItem("ninna_user", JSON.stringify(customer));
            setLocation("/chat");
          }
        } catch (err) {
          console.error("Failed to init customer:", err);
        }
      };
      initCustomer();
    }
  }, [isLoading, isAuthenticated, user, setLocation]);

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4 overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_-20%,#db277733,transparent)] pointer-events-none" />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <Card className="border-pink-500/20 bg-black/40 backdrop-blur-2xl shadow-2xl overflow-hidden rounded-3xl">
          <div className="relative h-[450px] overflow-hidden">
            <img 
              src={ninnaPhoto} 
              alt="Ninna Ray"
              className="w-full h-full object-contain bg-black"
              data-testid="img-ninna"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent pointer-events-none" />
            <div className="absolute bottom-6 left-6">
              <h1 className="text-4xl font-bold text-white tracking-tight">Ninna_Ray🍒</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <p className="text-pink-400 text-sm font-medium uppercase tracking-wider">
                  {lang === "cs" ? "Nyní online" : "Online now"}
                </p>
              </div>
            </div>
          </div>

          <CardContent className="pt-8 pb-10 px-8 space-y-6">
            <div className="flex justify-center gap-3">
              <button 
                onClick={() => setLang("cs")}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${lang === "cs" ? "bg-pink-600 text-white shadow-lg shadow-pink-600/20" : "bg-white/5 text-neutral-400 hover:bg-white/10"}`}
                data-testid="button-lang-cs"
              >
                CZECH
              </button>
              <button 
                onClick={() => setLang("en")}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${lang === "en" ? "bg-pink-600 text-white shadow-lg shadow-pink-600/20" : "bg-white/5 text-neutral-400 hover:bg-white/10"}`}
                data-testid="button-lang-en"
              >
                ENGLISH
              </button>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-4">
                <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <Button
                className="w-full bg-pink-600 hover:bg-pink-500 text-white font-bold h-14 rounded-2xl text-lg shadow-xl shadow-pink-900/20 transition-all active:scale-[0.98] border-none"
                onClick={() => { window.location.href = "/api/login"; }}
                data-testid="button-login"
              >
                {lang === "cs" ? "Přihlásit se a chatovat" : "Log in & Start Chat"}
              </Button>
            )}

            <p className="text-center text-[10px] text-neutral-600 uppercase tracking-widest font-medium">
              {lang === "cs" ? "Vstupem potvrzuješ věk 18+" : "Must be 18+ to enter"}
            </p>

            <div className="flex justify-center gap-4 pt-2">
              <a href="/agent" className="text-[10px] text-neutral-700 hover:text-neutral-500 transition-colors uppercase tracking-widest" data-testid="link-agent">
                Agent Login
              </a>
              <span className="text-neutral-800 text-[10px]">·</span>
              <a href="/admin" className="text-[10px] text-neutral-700 hover:text-neutral-500 transition-colors uppercase tracking-widest" data-testid="link-admin">
                Owner Dashboard
              </a>
              <span className="text-neutral-800 text-[10px]">·</span>
              <a href="/manager" className="text-[10px] text-neutral-700 hover:text-neutral-500 transition-colors uppercase tracking-widest" data-testid="link-manager">
                AI Manager
              </a>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

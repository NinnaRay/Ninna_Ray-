import { useState } from "react";
import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { ArrowRight, MessageCircleHeart } from "lucide-react";
import { useLocation } from "wouter";

export default function Landing() {
  const [name, setName] = useState("");
  const { createUser, isCreating, userId } = useUser();
  const [, setLocation] = useLocation();

  // If already logged in, redirect
  if (userId) {
    setLocation("/chat");
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createUser({ name });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] pointer-events-none opacity-40 mix-blend-screen" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-secondary/20 rounded-full blur-[120px] pointer-events-none opacity-40 mix-blend-screen" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md space-y-8 relative z-10"
      >
        <div className="text-center space-y-2">
          <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-tr from-primary/20 to-secondary/20 flex items-center justify-center border border-white/10 mb-6 backdrop-blur-sm">
            <MessageCircleHeart className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold bg-clip-text text-transparent bg-gradient-to-br from-white via-white to-gray-500">
            Talk to Lexi
          </h1>
          <p className="text-lg text-muted-foreground">
            Your private AI companion. Flirty, fun, and always here for you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium text-gray-400 ml-1">
              What should I call you?
            </label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name..."
              className="h-14 px-6 rounded-2xl bg-white/5 border-white/10 text-lg focus:border-primary/50 focus:ring-primary/20 transition-all placeholder:text-white/20"
              autoFocus
              required
            />
          </div>

          <Button
            type="submit"
            disabled={isCreating || !name.trim()}
            className="w-full h-14 rounded-2xl text-lg font-semibold bg-gradient-to-r from-primary to-secondary hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-primary/20"
          >
            {isCreating ? (
              "Setting up..."
            ) : (
              <span className="flex items-center gap-2">
                Start Chatting <ArrowRight className="w-5 h-5" />
              </span>
            )}
          </Button>
        </form>

        <p className="text-center text-xs text-gray-600 mt-8">
          By entering, you agree to be 18+ and accept our terms of service.
        </p>
      </motion.div>
    </div>
  );
}

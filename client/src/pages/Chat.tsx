import { useEffect, useRef, useState } from "react";
import { useUser } from "@/hooks/use-user";
import { useChat } from "@/hooks/use-chat";
import { ChatBubble } from "@/components/ChatBubble";
import { UnlockContentModal } from "@/components/UnlockContentModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Lock, Image as ImageIcon, MoreVertical, LogOut } from "lucide-react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";

export default function Chat() {
  const { userId } = useUser();
  const [, setLocation] = useLocation();
  const { messages, sendMessage, isTyping, initConversation, activeConversationId } = useChat({ userId });
  const [inputValue, setInputValue] = useState("");
  const [showUnlock, setShowUnlock] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Redirect if no user
  useEffect(() => {
    if (!userId) {
      setLocation("/");
    } else if (!activeConversationId) {
      initConversation();
    }
  }, [userId, setLocation, initConversation, activeConversationId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    sendMessage(inputValue);
    setInputValue("");
  };

  const handleLogout = () => {
    localStorage.removeItem("lexi_chat_user_id");
    setLocation("/");
  };

  if (!userId) return null;

  return (
    <div className="flex flex-col h-screen bg-background relative max-w-md mx-auto shadow-2xl overflow-hidden border-x border-white/5">
      {/* Background Glow */}
      <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none z-0" />

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-4 z-10 bg-background/80 backdrop-blur-md border-b border-white/5 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            {/* Unsplash image for avatar: Fashion model portrait */}
            {/* https://unsplash.com/photos/woman-in-black-tank-top-smiling-mEZ3PoFGs_k */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-secondary p-[2px]">
               <img 
                 src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop" 
                 alt="Lexi" 
                 className="w-full h-full rounded-full object-cover border-2 border-background"
               />
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background animate-pulse" />
          </div>
          <div>
            <h2 className="font-display font-bold text-lg leading-none">Lexi</h2>
            <span className="text-xs text-primary font-medium">Online now</span>
          </div>
        </div>
        <div className="flex gap-2">
           <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white" onClick={handleLogout}>
             <LogOut className="w-5 h-5" />
           </Button>
           <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white">
             <MoreVertical className="w-5 h-5" />
           </Button>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-thin scrollbar-thumb-gray-800">
        <div className="text-center py-4">
          <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-500 font-medium border border-white/5">
            Encrypted conversation with Lexi
          </span>
        </div>
        
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <ChatBubble 
              key={msg.id} 
              role={msg.role} 
              content={msg.content} 
              isTyping={msg.isTyping} 
            />
          ))}
        </AnimatePresence>

        {isTyping && !messages.find(m => m.isTyping) && (
          <ChatBubble role="assistant" content="" isTyping={true} />
        )}
        
        <div ref={scrollRef} className="h-4" />
      </main>

      {/* Floating CTA */}
      <div className="absolute bottom-24 left-4 right-4 z-20 pointer-events-none flex justify-center">
        <motion.button
          onClick={() => setShowUnlock(true)}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 2, duration: 0.5 }}
          className="pointer-events-auto bg-black/60 backdrop-blur-xl border border-primary/30 text-primary-foreground px-4 py-2 rounded-full shadow-lg flex items-center gap-2 hover:bg-black/80 transition-colors group"
        >
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center group-hover:bg-primary/40 transition-colors">
            <Lock className="w-3 h-3 text-primary" />
          </div>
          <span className="text-sm font-medium bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300">
            Exclusive photos available
          </span>
        </motion.button>
      </div>

      {/* Input Area */}
      <footer className="p-4 bg-background border-t border-white/5 z-20">
        <form onSubmit={handleSend} className="flex items-end gap-2 relative">
           <Button 
             type="button" 
             size="icon" 
             variant="ghost" 
             className="text-gray-400 hover:text-primary transition-colors shrink-0 h-12 w-12"
             onClick={() => setShowUnlock(true)}
           >
             <ImageIcon className="w-6 h-6" />
           </Button>
           
           <div className="flex-1 relative">
             <Input
               value={inputValue}
               onChange={(e) => setInputValue(e.target.value)}
               placeholder="Message Lexi..."
               className="h-12 rounded-2xl bg-white/5 border-transparent focus:bg-white/10 focus:border-primary/30 pl-4 pr-12 transition-all"
             />
             <Button 
               type="submit" 
               size="icon"
               disabled={!inputValue.trim()}
               className="absolute right-1 top-1 h-10 w-10 rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:bg-gray-700 transition-all shadow-lg shadow-primary/20"
             >
               <Send className="w-4 h-4 ml-0.5" />
             </Button>
           </div>
        </form>
      </footer>

      <UnlockContentModal open={showUnlock} onOpenChange={setShowUnlock} />
    </div>
  );
}

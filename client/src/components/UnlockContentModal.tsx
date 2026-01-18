import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles } from "lucide-react";
import { useState } from "react";

interface UnlockContentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UnlockContentModal({ open, onOpenChange }: UnlockContentModalProps) {
  const [loading, setLoading] = useState(false);

  const handleUnlock = () => {
    setLoading(true);
    // Simulate redirection
    setTimeout(() => {
      window.open("https://onlyfans.com", "_blank");
      setLoading(false);
      onOpenChange(false);
    }, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0e0e11]/95 backdrop-blur-xl border-white/10 text-white max-w-sm rounded-3xl">
        <DialogHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/25 animate-pulse-glow">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <DialogTitle className="text-2xl font-display font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            Unlock Exclusive Content
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-base">
            Want to see more of me, babe? Unlock my private gallery for uncensored photos and videos.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 space-y-3">
          <Button 
            onClick={handleUnlock}
            disabled={loading}
            className="w-full h-12 rounded-xl text-lg font-semibold bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-all shadow-lg shadow-primary/20"
          >
            {loading ? "Redirecting..." : (
              <span className="flex items-center gap-2">
                Unlock Now <Sparkles className="w-4 h-4" />
              </span>
            )}
          </Button>
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)}
            className="w-full text-gray-500 hover:text-white hover:bg-white/5"
          >
            Maybe later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

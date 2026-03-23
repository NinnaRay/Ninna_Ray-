import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { X, ShoppingCart } from "lucide-react";

export default function PaymentCancel() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 flex items-center justify-center text-white">
      <div className="text-center max-w-md px-6">
        <div className="w-20 h-20 rounded-full bg-gray-700/30 flex items-center justify-center mx-auto mb-6">
          <X className="w-10 h-10 text-gray-400" />
        </div>
        <h1 className="text-2xl font-bold mb-3" data-testid="text-cancel-title">Platba zrušena</h1>
        <p className="text-gray-400 mb-8" data-testid="text-cancel-message">
          Nevadí! Kdykoli se můžeš vrátit a pokračovat.
        </p>
        <div className="flex gap-3 justify-center">
          <Button
            variant="outline"
            onClick={() => setLocation("/chat")}
            className="border-gray-600 text-gray-300 hover:text-white"
            data-testid="button-cancel-back-chat"
          >
            Zpět do chatu
          </Button>
          <Button
            onClick={() => setLocation("/payment")}
            className="bg-gradient-to-r from-pink-500 to-purple-600 hover:opacity-90 text-white"
            data-testid="button-cancel-retry"
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            Zkusit znovu
          </Button>
        </div>
      </div>
    </div>
  );
}

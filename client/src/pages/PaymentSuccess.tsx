import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Check, MessageCircle } from "lucide-react";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 flex items-center justify-center text-white">
      <div className="text-center max-w-md px-6">
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
          <Check className="w-10 h-10 text-green-400" />
        </div>
        <h1 className="text-2xl font-bold mb-3" data-testid="text-success-title">Platba proběhla!</h1>
        <p className="text-gray-400 mb-8" data-testid="text-success-message">
          Díky moc! Tvůj přístup je aktivní. Ninna se na tebe už těší...
        </p>
        <Button
          onClick={() => setLocation("/chat")}
          className="bg-gradient-to-r from-pink-500 to-purple-600 hover:opacity-90 text-white px-8"
          data-testid="button-back-to-chat"
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          Zpět do chatu
        </Button>
      </div>
    </div>
  );
}

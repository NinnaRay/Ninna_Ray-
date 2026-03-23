import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { Crown, Sparkles, Heart, Star, ArrowLeft, CreditCard, Lock, Check } from "lucide-react";

export default function Payment() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState<string | null>(null);

  const userStr = localStorage.getItem("ninna_user");
  const user = userStr ? JSON.parse(userStr) : null;

  const { data: stripeData, isLoading } = useQuery<{ products: any[]; connected: boolean }>({
    queryKey: ["/api/stripe/products"],
  });

  const { data: subData } = useQuery<{ subscription: any }>({
    queryKey: ["/api/stripe/subscription", user?.id ? String(user.id) : "0"],
    enabled: !!user?.id,
  });

  const handleCheckout = async (priceId: string) => {
    if (!user?.id) {
      setLocation("/");
      return;
    }
    setLoading(priceId);
    try {
      const res = await apiRequest("POST", "/api/stripe/checkout", { priceId, userId: user.id });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      console.error("Checkout error:", err);
    } finally {
      setLoading(null);
    }
  };

  const hasActiveSubscription = subData?.subscription?.status === "active" || subData?.subscription?.status === "trialing";

  const iconMap: Record<string, any> = {
    subscription: Crown,
    ppv: Sparkles,
    custom: Star,
    tip: Heart,
  };

  const colorMap: Record<string, string> = {
    subscription: "from-amber-500 to-orange-600",
    ppv: "from-purple-500 to-pink-600",
    custom: "from-blue-500 to-indigo-600",
    tip: "from-red-400 to-pink-500",
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Načítám...</div>
      </div>
    );
  }

  const connected = stripeData?.connected;
  const products = stripeData?.products || [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/chat")}
            className="text-gray-400 hover:text-white"
            data-testid="button-back-chat"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Zpět do chatu
          </Button>
        </div>

        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2" data-testid="text-payment-title">
            Ninna Ray <span className="text-pink-500">VIP</span>
          </h1>
          <p className="text-gray-400" data-testid="text-payment-subtitle">
            Odemkni exkluzivní obsah a zážitky
          </p>
        </div>

        {hasActiveSubscription && (
          <div className="mb-8 p-4 rounded-xl bg-green-900/30 border border-green-700/50 text-center" data-testid="status-active-subscription">
            <div className="flex items-center justify-center gap-2 text-green-400">
              <Check className="w-5 h-5" />
              <span className="font-semibold">Máš aktivní VIP předplatné</span>
            </div>
          </div>
        )}

        {!connected && (
          <div className="mb-8 p-6 rounded-xl bg-gray-800/50 border border-gray-700 text-center" data-testid="status-payments-offline">
            <Lock className="w-8 h-8 text-gray-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-300 mb-1">Platby se připravují</h3>
            <p className="text-gray-500 text-sm">
              Platební systém bude brzy aktivní. Sleduj novinky!
            </p>
          </div>
        )}

        {connected && products.length === 0 && (
          <div className="mb-8 p-6 rounded-xl bg-gray-800/50 border border-gray-700 text-center" data-testid="status-no-products">
            <CreditCard className="w-8 h-8 text-gray-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-300 mb-1">Zatím žádné produkty</h3>
            <p className="text-gray-500 text-sm">Produkty budou brzy přidány.</p>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {products.map((product: any) => {
            const category = product.metadata?.category || "subscription";
            const Icon = iconMap[category] || Crown;
            const gradient = colorMap[category] || colorMap.subscription;

            return (
              <Card key={product.id} className="bg-gray-800/60 border-gray-700 overflow-hidden hover:border-gray-600 transition-colors" data-testid={`card-product-${product.id}`}>
                <div className={`h-2 bg-gradient-to-r ${gradient}`} />
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg bg-gradient-to-r ${gradient}`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-white" data-testid={`text-product-name-${product.id}`}>
                        {product.name}
                      </CardTitle>
                    </div>
                  </div>
                  {product.description && (
                    <CardDescription className="text-gray-400 mt-2" data-testid={`text-product-desc-${product.id}`}>
                      {product.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {product.prices.map((price: any) => {
                    const amount = (price.unitAmount / 100).toFixed(0);
                    const currency = (price.currency || "czk").toUpperCase();
                    const isRecurring = !!price.recurring;
                    const interval = price.recurring?.interval;
                    const intervalLabel = interval === "month" ? "/měsíc" : interval === "year" ? "/rok" : "";

                    return (
                      <div key={price.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-900/50 border border-gray-700/50">
                        <div>
                          <span className="text-xl font-bold text-white" data-testid={`text-price-${price.id}`}>
                            {amount} {currency}
                          </span>
                          {isRecurring && (
                            <span className="text-gray-400 text-sm">{intervalLabel}</span>
                          )}
                          {!isRecurring && (
                            <Badge variant="secondary" className="ml-2 text-xs">jednorázově</Badge>
                          )}
                        </div>
                        <Button
                          onClick={() => handleCheckout(price.id)}
                          disabled={!!loading || (category === "subscription" && hasActiveSubscription)}
                          className={`bg-gradient-to-r ${gradient} hover:opacity-90 text-white border-0`}
                          data-testid={`button-buy-${price.id}`}
                        >
                          {loading === price.id ? (
                            <span className="animate-pulse">Zpracovávám...</span>
                          ) : category === "subscription" && hasActiveSubscription ? (
                            "Aktivní"
                          ) : (
                            <>
                              <CreditCard className="w-4 h-4 mr-1" />
                              Koupit
                            </>
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-10 text-center text-gray-500 text-xs" data-testid="text-payment-footer">
          <Lock className="w-3 h-3 inline mr-1" />
          Bezpečné platby přes Stripe. Tvoje údaje jsou šifrované.
        </div>
      </div>
    </div>
  );
}

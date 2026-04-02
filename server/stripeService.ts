import { getUncachableStripeClient, isStripeConnected } from './stripeClient';
import { db } from './db';
import { sql } from 'drizzle-orm';

export const SUBSCRIPTION_PLANS = [
  {
    key: "basic",
    name: "Ninna Ray BASIC",
    description: "Přístup k exkluzivnímu obsahu každý týden, prioritní odpovědi v chatu",
    priceMonthly: 29900,
    features: ["Exkluzivní fotky každý týden", "Prioritní odpovědi v chatu", "Přístup k archivu obsahu"],
    emoji: "💗",
    badge: "",
  },
  {
    key: "vip",
    name: "Ninna Ray VIP",
    description: "Neomezený přístup ke všemu obsahu + bonus obsah každý měsíc",
    priceMonthly: 59900,
    features: ["Vše z BASIC", "Neomezené fotky a videa", "Bonus obsah každý měsíc", "VIP odznak v chatu"],
    emoji: "💋",
    badge: "Nejpopulárnější",
  },
  {
    key: "premium",
    name: "Ninna Ray PREMIUM",
    description: "Vše + custom obsah na míru a přímá komunikace s prioritou",
    priceMonthly: 99900,
    features: ["Vše z VIP", "Custom obsah na míru (1x měsíčně)", "Nejvyšší priorita odpovědí", "Exkluzivní série obsahu"],
    emoji: "👑",
    badge: "Premium",
  },
];

export class StripeService {
  async createCustomer(name: string, metadata: Record<string, string> = {}) {
    const stripe = await getUncachableStripeClient();
    return await stripe.customers.create({ name, metadata });
  }

  async createCheckoutSession(customerId: string, priceId: string, successUrl: string, cancelUrl: string, mode: 'subscription' | 'payment' = 'subscription') {
    const stripe = await getUncachableStripeClient();
    return await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  async createCustomerPortalSession(customerId: string, returnUrl: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
  }

  async ensureSubscriptionProducts(): Promise<Map<string, string>> {
    const priceIdMap = new Map<string, string>();
    try {
      const stripe = await getUncachableStripeClient();
      const existing = await stripe.products.list({ active: true, limit: 100 });
      const existingByKey = new Map(
        existing.data
          .filter(p => p.metadata?.ninnaKey)
          .map(p => [p.metadata.ninnaKey, p])
      );

      for (const plan of SUBSCRIPTION_PLANS) {
        let product = existingByKey.get(plan.key);
        if (!product) {
          product = await stripe.products.create({
            name: plan.name,
            description: plan.description,
            metadata: { ninnaKey: plan.key, category: "subscription" },
          });
          console.log(`[Stripe] Vytvořen produkt: ${plan.name}`);
        }

        const prices = await stripe.prices.list({ product: product.id, active: true, limit: 10 });
        const monthlyPrice = prices.data.find(p => p.recurring?.interval === "month" && p.unit_amount === plan.priceMonthly);

        if (monthlyPrice) {
          priceIdMap.set(plan.key, monthlyPrice.id);
        } else {
          const newPrice = await stripe.prices.create({
            product: product.id,
            unit_amount: plan.priceMonthly,
            currency: "czk",
            recurring: { interval: "month" },
          });
          priceIdMap.set(plan.key, newPrice.id);
          console.log(`[Stripe] Vytvořena cena pro ${plan.name}: ${plan.priceMonthly / 100} Kč/měsíc`);
        }
      }
    } catch (err: any) {
      console.error("[Stripe] ensureSubscriptionProducts error:", err.message);
    }
    return priceIdMap;
  }

  async getSubscriptionPlansWithPrices(): Promise<Array<typeof SUBSCRIPTION_PLANS[0] & { priceId: string | null }>> {
    try {
      const stripe = await getUncachableStripeClient();
      const products = await stripe.products.list({ active: true, limit: 100 });
      const ninnaProducts = products.data.filter(p => p.metadata?.ninnaKey);

      return await Promise.all(SUBSCRIPTION_PLANS.map(async plan => {
        const product = ninnaProducts.find(p => p.metadata.ninnaKey === plan.key);
        if (!product) return { ...plan, priceId: null };
        const prices = await stripe.prices.list({ product: product.id, active: true, limit: 10 });
        const price = prices.data.find(p => p.recurring?.interval === "month");
        return { ...plan, priceId: price?.id || null };
      }));
    } catch (err: any) {
      console.error("[Stripe] getSubscriptionPlansWithPrices error:", err.message);
      return SUBSCRIPTION_PLANS.map(p => ({ ...p, priceId: null }));
    }
  }

  async listProductsWithPrices() {
    const result = await db.execute(sql`
      SELECT 
        p.id as product_id, p.name as product_name, p.description as product_description,
        p.active as product_active, p.metadata as product_metadata,
        pr.id as price_id, pr.unit_amount, pr.currency, pr.recurring, pr.active as price_active
      FROM stripe.products p
      LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true
      ORDER BY p.id, pr.unit_amount
    `);
    const productsMap = new Map();
    for (const row of result.rows) {
      const r = row as any;
      if (!productsMap.has(r.product_id)) {
        productsMap.set(r.product_id, {
          id: r.product_id, name: r.product_name, description: r.product_description,
          metadata: r.product_metadata, prices: [],
        });
      }
      if (r.price_id) {
        productsMap.get(r.product_id).prices.push({
          id: r.price_id, unitAmount: r.unit_amount, currency: r.currency, recurring: r.recurring,
        });
      }
    }
    return Array.from(productsMap.values());
  }

  async getSubscription(subscriptionId: string) {
    const result = await db.execute(sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscriptionId}`);
    return (result.rows[0] as any) || null;
  }

  async getCustomerSubscriptions(customerId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.subscriptions WHERE customer = ${customerId} AND status IN ('active', 'trialing') ORDER BY id DESC LIMIT 1`
    );
    return (result.rows[0] as any) || null;
  }
}

export const stripeService = new StripeService();

import { getUncachableStripeClient, isStripeConnected } from './stripeClient';
import { db } from './db';
import { sql } from 'drizzle-orm';

export class StripeService {
  async createCustomer(name: string, metadata: Record<string, string> = {}) {
    const stripe = await getUncachableStripeClient();
    return await stripe.customers.create({
      name,
      metadata,
    });
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
    return await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  async listProductsWithPrices() {
    const result = await db.execute(sql`
      SELECT 
        p.id as product_id,
        p.name as product_name,
        p.description as product_description,
        p.active as product_active,
        p.metadata as product_metadata,
        pr.id as price_id,
        pr.unit_amount,
        pr.currency,
        pr.recurring,
        pr.active as price_active
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
          id: r.product_id,
          name: r.product_name,
          description: r.product_description,
          metadata: r.product_metadata,
          prices: [],
        });
      }
      if (r.price_id) {
        productsMap.get(r.product_id).prices.push({
          id: r.price_id,
          unitAmount: r.unit_amount,
          currency: r.currency,
          recurring: r.recurring,
        });
      }
    }
    return Array.from(productsMap.values());
  }

  async getSubscription(subscriptionId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscriptionId}`
    );
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

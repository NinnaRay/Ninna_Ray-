import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';

let syncInstance: StripeSync | null = null;

async function getStripeSettings(): Promise<{ stripe_secret_key: string; stripe_webhook_secret?: string }> {
  try {
    const res = await fetch('http://localhost:1106/connections');
    if (!res.ok) throw new Error('Connections API unavailable');
    const connections = await res.json();
    const stripeConn = connections.find((c: any) =>
      c.connectorConfigId?.includes('stripe') || c.displayName?.toLowerCase() === 'stripe'
    );
    if (!stripeConn?.settings?.stripe_secret_key) {
      throw new Error('Stripe not connected');
    }
    return stripeConn.settings;
  } catch {
    throw new Error('Stripe integration not connected. Connect Stripe in the Integrations tab.');
  }
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const settings = await getStripeSettings();
  return new Stripe(settings.stripe_secret_key);
}

export async function getStripeSync(): Promise<StripeSync> {
  if (syncInstance) return syncInstance;
  const settings = await getStripeSettings();
  syncInstance = new StripeSync({
    stripeSecretKey: settings.stripe_secret_key,
    stripeWebhookSecret: settings.stripe_webhook_secret || '',
    databaseUrl: process.env.DATABASE_URL!,
  });
  return syncInstance;
}

export async function isStripeConnected(): Promise<boolean> {
  try {
    await getStripeSettings();
    return true;
  } catch {
    return false;
  }
}

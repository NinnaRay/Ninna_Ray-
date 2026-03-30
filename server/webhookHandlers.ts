import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    try {
      const stripe = await getUncachableStripeClient();
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (webhookSecret) {
        const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        await WebhookHandlers.handleEvent(event);
      }
    } catch (err: any) {
      console.error('[Webhook] Event processing error:', err.message);
    }
  }

  static async handleEvent(event: any): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const sessionId = session.id;
        const paymentIntentId = session.payment_intent;

        try {
          const payment = await storage.getPaymentByStripeSession(sessionId);
          if (payment) {
            await storage.updatePaymentStatus(payment.id, 'completed', paymentIntentId);
            await storage.addManagerLog('payment_success', `Platba #${payment.id} úspěšně dokončena, session: ${sessionId}`);
            console.log(`[Webhook] Payment #${payment.id} completed successfully`);

            if (payment.userId) {
              const convs = await storage.getConversationsByUser(payment.userId);
              if (convs.length > 0) {
                const amountCzk = Math.round(payment.amount / 100);
                let confirmMsg = `✅ Platba ${amountCzk} Kč přijata! Děkuji, miláčku 💋`;
                if (payment.contentItemId) {
                  const item = await storage.getContentItem(payment.contentItemId);
                  if (item) {
                    const isVideo = item.mimeType?.startsWith("video");
                    confirmMsg = `✅ Platba ${amountCzk} Kč přijata! Tady máš svůj exkluzivní ${isVideo ? "video" : "obsah"} 💋🔓\n\n[UNLOCKED_CONTENT:${payment.contentItemId}]`;
                  }
                }
                await storage.createMessage(convs[0].id, "assistant", confirmMsg);
              }
            }
          }
        } catch (err: any) {
          console.error('[Webhook] checkout.session.completed error:', err.message);
          await storage.addManagerLog('payment_webhook_error', `Chyba při zpracování platby: ${err.message}`);
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const intent = event.data.object;
        console.log(`[Webhook] PaymentIntent ${intent.id} succeeded, amount: ${intent.amount}`);
        await storage.addManagerLog('payment_intent_success', `PaymentIntent ${intent.id} úspěšný, částka: ${intent.amount / 100} ${intent.currency.toUpperCase()}`);
        break;
      }

      case 'payment_intent.payment_failed': {
        const intent = event.data.object;
        const error = intent.last_payment_error?.message || 'Unknown error';
        console.error(`[Webhook] PaymentIntent ${intent.id} failed: ${error}`);
        await storage.addManagerLog('payment_failed', `PaymentIntent ${intent.id} selhal: ${error}`);

        try {
          const metadata = intent.metadata || {};
          if (metadata.userId) {
            const userPayments = await storage.getPaymentsByUser(parseInt(metadata.userId));
            const pendingPayment = userPayments.find(p => p.status === 'pending');
            if (pendingPayment) {
              await storage.updatePaymentStatus(pendingPayment.id, 'failed', intent.id);
            }
          }
        } catch (err: any) {
          console.error('[Webhook] Failed payment tracking error:', err.message);
        }
        break;
      }

      default:
        break;
    }
  }
}

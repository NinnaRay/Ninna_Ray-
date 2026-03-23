import { getUncachableStripeClient } from '../server/stripeClient';

async function createProducts() {
  try {
    const stripe = await getUncachableStripeClient();
    console.log('Creating Ninna Ray products in Stripe...');

    const existingProducts = await stripe.products.search({
      query: "name:'Ninna Ray VIP' AND active:'true'"
    });

    if (existingProducts.data.length > 0) {
      console.log('Products already exist. Skipping.');
      return;
    }

    const vipProduct = await stripe.products.create({
      name: 'Ninna Ray VIP',
      description: 'Exclusive VIP access — private photos, videos & personal messages from Ninna Ray',
      metadata: { category: 'subscription', tier: 'vip' },
    });
    console.log(`Created: ${vipProduct.name} (${vipProduct.id})`);

    const monthlyPrice = await stripe.prices.create({
      product: vipProduct.id,
      unit_amount: 1499,
      currency: 'usd',
      recurring: { interval: 'month' },
    });
    console.log(`Monthly price: $14.99/month (${monthlyPrice.id})`);

    console.log('\nBase subscription created! Webhooks will sync to database.');
    console.log('Run the pricing strategy analysis in the Manager dashboard for additional product recommendations.');
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

createProducts();

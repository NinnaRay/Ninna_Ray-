import { getUncachableStripeClient } from '../server/stripeClient';

async function createProducts() {
  try {
    const stripe = await getUncachableStripeClient();
    console.log('Creating Ninna Ray products in Stripe...');

    const existingProducts = await stripe.products.search({
      query: "name:'VIP Předplatné' AND active:'true'"
    });

    if (existingProducts.data.length > 0) {
      console.log('Products already exist. Skipping.');
      return;
    }

    const vipProduct = await stripe.products.create({
      name: 'VIP Předplatné',
      description: 'Exkluzivní přístup k VIP obsahu od Ninna Ray — soukromé fotky, videa a osobní zprávy',
      metadata: { category: 'subscription', tier: 'vip' },
    });
    console.log(`Created: ${vipProduct.name} (${vipProduct.id})`);

    const monthlyPrice = await stripe.prices.create({
      product: vipProduct.id,
      unit_amount: 999,
      currency: 'czk',
      recurring: { interval: 'month' },
    });
    console.log(`Monthly price: 99.90 CZK/month (${monthlyPrice.id})`);

    const yearlyPrice = await stripe.prices.create({
      product: vipProduct.id,
      unit_amount: 9990,
      currency: 'czk',
      recurring: { interval: 'year' },
    });
    console.log(`Yearly price: 999 CZK/year (${yearlyPrice.id})`);

    const ppvProduct = await stripe.products.create({
      name: 'Exkluzivní Obsah',
      description: 'Jednorázový přístup k premium obsahu',
      metadata: { category: 'ppv', tier: 'premium' },
    });
    console.log(`Created: ${ppvProduct.name} (${ppvProduct.id})`);

    const ppvPrice = await stripe.prices.create({
      product: ppvProduct.id,
      unit_amount: 299,
      currency: 'czk',
    });
    console.log(`PPV price: 29.90 CZK (${ppvPrice.id})`);

    const customProduct = await stripe.products.create({
      name: 'Custom Obsah',
      description: 'Obsah na míru podle tvých přání',
      metadata: { category: 'custom', tier: 'premium' },
    });
    console.log(`Created: ${customProduct.name} (${customProduct.id})`);

    const customPrice = await stripe.prices.create({
      product: customProduct.id,
      unit_amount: 499,
      currency: 'czk',
    });
    console.log(`Custom price: 49.90 CZK (${customPrice.id})`);

    const tipProduct = await stripe.products.create({
      name: 'Tip pro Ninnu',
      description: 'Pošli Ninně tip jako poděkování',
      metadata: { category: 'tip' },
    });
    console.log(`Created: ${tipProduct.name} (${tipProduct.id})`);

    for (const amount of [50, 100, 200, 500]) {
      const tipPrice = await stripe.prices.create({
        product: tipProduct.id,
        unit_amount: amount * 100,
        currency: 'czk',
      });
      console.log(`Tip ${amount} CZK (${tipPrice.id})`);
    }

    console.log('\nAll products created! Webhooks will sync them to the database.');
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

createProducts();

'use strict';

const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'placeholder', {
  apiVersion: '2023-10-16',
});

/**
 * Create a Stripe Checkout session for a subscription.
 */
async function createCheckoutSession({ customerId, priceId, successUrl, cancelUrl, email }) {
  const params = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
  };

  if (customerId) {
    params.customer = customerId;
  } else if (email) {
    params.customer_email = email;
  }

  return stripe.checkout.sessions.create(params);
}

/**
 * Create or retrieve a Stripe customer for a user.
 */
async function getOrCreateCustomer({ email, userId }) {
  const existing = await stripe.customers.list({ email, limit: 1 });
  if (existing.data.length > 0) return existing.data[0];

  return stripe.customers.create({
    email,
    metadata: { supabase_user_id: userId },
  });
}

/**
 * Create a billing portal session.
 */
async function createPortalSession({ customerId, returnUrl }) {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

/**
 * Construct a Stripe webhook event.
 */
function constructWebhookEvent(payload, sig) {
  return stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);
}

module.exports = {
  stripe,
  createCheckoutSession,
  getOrCreateCustomer,
  createPortalSession,
  constructWebhookEvent,
};

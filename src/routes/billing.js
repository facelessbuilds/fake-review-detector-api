'use strict';

const express = require('express');
const router = express.Router();
const {
  createCheckoutSession,
  getOrCreateCustomer,
  createPortalSession,
  constructWebhookEvent,
} = require('../services/stripeService');
const supabase = require('../services/supabaseClient');
const { requireAuth } = require('../middleware/authMiddleware');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://api-production-d1f7.up.railway.app';

const PRICE_MAP = {
  pro: process.env.STRIPE_PRO_PRICE_ID,
  business: process.env.STRIPE_BUSINESS_PRICE_ID,
};

/**
 * POST /api/billing/create-checkout
 * Body: { plan: 'pro' | 'business' }
 */
router.post('/create-checkout', requireAuth, async (req, res) => {
  const { plan } = req.body;
  if (!PRICE_MAP[plan]) {
    return res.status(400).json({ error: 'Invalid plan. Must be "pro" or "business"' });
  }

  try {
    const customer = await getOrCreateCustomer({
      email: req.user.email,
      userId: req.user.id,
    });

    // Save customer ID to profile
    await supabase
      .from('profiles')
      .update({ stripe_customer_id: customer.id })
      .eq('id', req.user.id);

    const session = await createCheckoutSession({
      customerId: customer.id,
      priceId: PRICE_MAP[plan],
      successUrl: `${FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${FRONTEND_URL}/#pricing`,
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('[billing] Checkout error:', err.message);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

/**
 * GET /api/billing/portal
 * Redirects to Stripe Customer Portal
 */
router.get('/portal', requireAuth, async (req, res) => {
  const customerId = req.user.stripeCustomerId;
  if (!customerId) {
    return res.status(400).json({ error: 'No billing account found. Please subscribe first.' });
  }

  try {
    const portal = await createPortalSession({
      customerId,
      returnUrl: `${FRONTEND_URL}/dashboard`,
    });
    return res.json({ url: portal.url });
  } catch (err) {
    console.error('[billing] Portal error:', err.message);
    return res.status(500).json({ error: 'Failed to create portal session' });
  }
});

/**
 * POST /api/billing/webhook
 * Stripe webhook handler (raw body required)
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = constructWebhookEvent(req.body, sig);
  } catch (err) {
    console.error('[billing] Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const customerId = sub.customer;
        const status = sub.status;
        const priceId = sub.items.data[0]?.price?.id;

        let plan = 'free';
        if (status === 'active' || status === 'trialing') {
          if (priceId === process.env.STRIPE_PRO_PRICE_ID) plan = 'pro';
          else if (priceId === process.env.STRIPE_BUSINESS_PRICE_ID) plan = 'business';
        }

        await supabase
          .from('profiles')
          .update({ plan, stripe_subscription_id: sub.id })
          .eq('stripe_customer_id', customerId);

        console.log(`[billing] Subscription ${event.type}: customer ${customerId} → plan ${plan}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await supabase
          .from('profiles')
          .update({ plan: 'free', stripe_subscription_id: null })
          .eq('stripe_customer_id', sub.customer);

        console.log(`[billing] Subscription cancelled: customer ${sub.customer}`);
        break;
      }

      default:
        // Ignore unhandled events
        break;
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('[billing] Webhook handler error:', err.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;

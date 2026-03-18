'use strict';

const supabase = require('../services/supabaseClient');

/**
 * Middleware: require a valid Supabase JWT.
 * Sets req.user = { id, email, plan } on success.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Fetch plan from profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, stripe_customer_id')
      .eq('id', user.id)
      .single();

    req.user = {
      id: user.id,
      email: user.email,
      plan: profile?.plan || 'free',
      stripeCustomerId: profile?.stripe_customer_id || null,
    };

    next();
  } catch (err) {
    console.error('[auth] Token verification failed:', err.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

/**
 * Middleware: optionally parse auth if present, but don't require it.
 * Sets req.user if valid token found, otherwise leaves undefined.
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan, stripe_customer_id')
        .eq('id', user.id)
        .single();

      req.user = {
        id: user.id,
        email: user.email,
        plan: profile?.plan || 'free',
        stripeCustomerId: profile?.stripe_customer_id || null,
      };
    }
  } catch (_) {
    // Ignore auth errors in optional mode
  }
  next();
}

module.exports = { requireAuth, optionalAuth };

'use strict';

const supabase = require('../services/supabaseClient');

const FREE_DAILY_LIMIT = 10;

/**
 * Rate limit middleware for /api/analyze.
 * - Authenticated free users: 10 scans/day
 * - Authenticated pro/business users: unlimited
 * - Anonymous users: 5 scans/day (by fingerprint)
 */
async function rateLimitAnalyze(req, res, next) {
  try {
    // Pro/business users: skip rate limiting
    if (req.user && (req.user.plan === 'pro' || req.user.plan === 'business')) {
      return next();
    }

    const userId = req.user?.id || null;
    const fingerprint = req.headers['x-fingerprint'] || req.ip;
    const limit = userId ? FREE_DAILY_LIMIT : 5;

    // Query daily usage
    let query = supabase
      .from('usage_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (userId) {
      query = query.eq('user_id', userId);
    } else {
      query = query.eq('fingerprint', fingerprint).is('user_id', null);
    }

    const { count, error } = await query;

    if (error) {
      // If Supabase is unavailable, allow the request (fail open)
      console.error('[rateLimit] Supabase error:', error.message);
      return next();
    }

    if (count >= limit) {
      return res.status(429).json({
        error: 'Daily scan limit reached',
        limit,
        upgrade: 'https://api-production-d1f7.up.railway.app/#pricing',
      });
    }

    next();
  } catch (err) {
    console.error('[rateLimit] Unexpected error:', err.message);
    next(); // Fail open
  }
}

module.exports = { rateLimitAnalyze };

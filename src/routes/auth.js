'use strict';

const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { requireAuth } = require('../middleware/authMiddleware');

/**
 * POST /api/auth/register
 * Body: { email, password }
 */
router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    return res.status(400).json({ error: error.message });
  }

  // Create profile row
  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id,
      email: data.user.email,
      plan: 'free',
    });
  }

  return res.status(201).json({
    message: 'Registration successful. Check your email to confirm your account.',
    userId: data.user?.id,
  });
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return res.status(401).json({ error: error.message });
  }

  return res.json({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
    user: {
      id: data.user.id,
      email: data.user.email,
    },
  });
});

/**
 * GET /api/auth/me
 * Returns user info + plan + daily usage
 */
router.get('/me', requireAuth, async (req, res) => {
  const userId = req.user.id;

  // Get daily usage count
  const { count: scansToday } = await supabase
    .from('usage_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  return res.json({
    id: userId,
    email: req.user.email,
    plan: req.user.plan,
    usage: {
      scansToday: scansToday || 0,
      dailyLimit: req.user.plan === 'free' ? 10 : null,
    },
  });
});

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 */
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken required' });
  }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error) {
    return res.status(401).json({ error: error.message });
  }

  return res.json({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
  });
});

module.exports = router;

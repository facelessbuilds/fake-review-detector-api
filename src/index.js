'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const analyzeRouter = require('./routes/analyze');
const authRouter = require('./routes/auth');
const billingRouter = require('./routes/billing');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security & CORS ──────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'https://api-production-d1f7.up.railway.app',
    /chrome-extension:\/\/.*/,    // Allow all Chrome extensions
    'http://localhost:3001',       // Local dev
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Fingerprint'],
}));

// ── Body parsing (must come before routes, but AFTER webhook raw parser) ────
// Note: /api/billing/webhook needs raw body — handled inside billing router
app.use((req, res, next) => {
  if (req.originalUrl === '/api/billing/webhook') {
    next();
  } else {
    express.json({ limit: '2mb' })(req, res, next);
  }
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', ts: new Date().toISOString() });
});

// ── Privacy policy (required for Chrome Web Store) ───────────────────────────
app.get('/privacy', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy – Fake Review Detector</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 760px; margin: 48px auto; padding: 0 24px; color: #222; line-height: 1.7; }
    h1 { font-size: 2rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.2rem; margin-top: 2rem; }
    p, li { font-size: 0.97rem; }
    a { color: #4f6ef7; }
    footer { margin-top: 3rem; font-size: 0.85rem; color: #888; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p><strong>Fake Review Detector</strong> &mdash; Last updated: March 20, 2026</p>

  <h2>1. Overview</h2>
  <p>Fake Review Detector ("we", "our", or "the Extension") is a Chrome browser extension that analyses product reviews to help users identify potentially fake or misleading content. We are committed to protecting your privacy.</p>

  <h2>2. Data We Collect</h2>
  <ul>
    <li><strong>Review text:</strong> When you analyse a page, review text visible on that page is sent to our API for analysis. This data is not stored after the response is returned.</li>
    <li><strong>Usage fingerprint:</strong> A non-identifying browser fingerprint is used solely for rate-limiting purposes. It cannot be used to identify you personally.</li>
    <li><strong>Account email (optional):</strong> If you create a paid account, we store your email address and subscription status via Stripe.</li>
  </ul>

  <h2>3. Data We Do NOT Collect</h2>
  <ul>
    <li>Browsing history or URLs beyond the active tab during analysis</li>
    <li>Personal identifiable information (name, address, phone)</li>
    <li>Cookies or tracking pixels</li>
    <li>Any data from pages you have not explicitly analysed</li>
  </ul>

  <h2>4. How We Use Data</h2>
  <p>Review text is processed in real time to generate a fakeness score and is immediately discarded. We do not sell, share, or use your data for advertising or profiling purposes.</p>

  <h2>5. Third-Party Services</h2>
  <ul>
    <li><strong>Anthropic:</strong> Review text is sent to Anthropic's API for analysis. See <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener">Anthropic's Privacy Policy</a>.</li>
    <li><strong>Stripe:</strong> Payment processing for paid plans. See <a href="https://stripe.com/privacy" target="_blank" rel="noopener">Stripe's Privacy Policy</a>.</li>
  </ul>

  <h2>6. Data Retention</h2>
  <p>Review text is not retained. Account information (email, subscription status) is retained for as long as your account is active and deleted upon request.</p>

  <h2>7. Your Rights</h2>
  <p>You may request deletion of your account and any associated data at any time by contacting us. We will action requests within 30 days.</p>

  <h2>8. Security</h2>
  <p>All data in transit is encrypted via HTTPS/TLS. We do not store review content on our servers.</p>

  <h2>9. Children</h2>
  <p>This Extension is not directed at children under 13. We do not knowingly collect data from children.</p>

  <h2>10. Changes to This Policy</h2>
  <p>We may update this policy occasionally. The "Last updated" date above will reflect any changes. Continued use of the Extension after changes constitutes acceptance.</p>

  <h2>11. Contact</h2>
  <p>Questions? Reach us via the Chrome Web Store support tab or the contact form on our website.</p>

  <footer>&copy; 2026 Fake Review Detector. All rights reserved.</footer>
</body>
</html>`);
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/analyze', analyzeRouter);
app.use('/api/auth', authRouter);
app.use('/api/billing', billingRouter);

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Fake Review Detector API running on port ${PORT}`);
});

module.exports = app;

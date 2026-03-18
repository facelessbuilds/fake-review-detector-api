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
    process.env.FRONTEND_URL || 'https://fakereviewdetector.io',
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

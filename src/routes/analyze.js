'use strict';

const express = require('express');
const router = express.Router();
const { analyzeProduct } = require('../services/detector');
const supabase = require('../services/supabaseClient');
const { optionalAuth } = require('../middleware/authMiddleware');
const { rateLimitAnalyze } = require('../middleware/rateLimit');

/**
 * POST /api/analyze
 * Body: { reviews: [...], productId: string, source: string, productMeta?: {} }
 */
router.post('/', optionalAuth, rateLimitAnalyze, async (req, res) => {
  const { reviews, productId, source, productMeta } = req.body;

  if (!reviews || !Array.isArray(reviews) || reviews.length === 0) {
    return res.status(400).json({ error: 'reviews must be a non-empty array' });
  }

  const validSources = ['amazon', 'tripadvisor', 'yelp', 'google', 'generic'];
  if (source && !validSources.includes(source)) {
    return res.status(400).json({ error: `source must be one of: ${validSources.join(', ')}` });
  }

  // Limit analysed reviews per request (prevent abuse)
  const MAX_REVIEWS = req.user?.plan === 'business' ? 500 : 100;
  const reviewsToAnalyze = reviews.slice(0, MAX_REVIEWS);

  try {
    const result = analyzeProduct(reviewsToAnalyze, productMeta || {});

    // Log usage asynchronously (don't block response)
    const userId = req.user?.id || null;
    const fingerprint = req.headers['x-fingerprint'] || req.ip;

    supabase.from('usage_logs').insert({
      user_id: userId,
      fingerprint: userId ? null : fingerprint,
      product_url: productId || null,
      source: source || 'generic',
      reviews_analyzed: reviewsToAnalyze.length,
      fake_score: result.productScore,
    }).then(({ error }) => {
      if (error) console.error('[analyze] Failed to log usage:', error.message);
    });

    return res.json({
      success: true,
      source: source || 'generic',
      productId: productId || null,
      ...result,
    });
  } catch (err) {
    console.error('[analyze] Detection error:', err);
    return res.status(500).json({ error: 'Analysis failed', details: err.message });
  }
});

module.exports = router;

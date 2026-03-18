'use strict';

// ─── Generic phrase patterns that signal fake/low-effort reviews ───────────────
const GENERIC_PATTERNS = [
  /\bgreat product\b/i,
  /\blove it\b/i,
  /\bhighly recommend\b/i,
  /\bperfect\b/i,
  /\bamazing\b/i,
  /\bexcellent\b/i,
  /\bwonderful\b/i,
  /\bfantastic\b/i,
  /\bjust as described\b/i,
  /\bfast shipping\b/i,
  /\bgreat seller\b/i,
  /\bwould buy again\b/i,
  /\bfive stars\b/i,
  /\b5 stars\b/i,
];

/**
 * Score a single review for fakeness (0–100).
 * Returns { reviewId, fakeScore, confidence, flags, verdict }
 */
function scoreReview(review, reviewerHistory = []) {
  let score = 0;
  const flags = [];

  const text = (review.text || '').trim();
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // ── Text signals ────────────────────────────────────────────────────────────

  // Short review
  if (wordCount < 15) {
    score += 15;
    flags.push('short_review');
  }

  // Generic language — count how many generic patterns match
  const genericMatches = GENERIC_PATTERNS.filter(p => p.test(text)).length;
  if (genericMatches >= 2) {
    score += 20;
    flags.push('generic_language');
  }

  // Excessive exclamation marks
  const exclamations = (text.match(/!/g) || []).length;
  if (exclamations > 3) {
    score += 10;
    flags.push('excessive_exclamation');
  }

  // ALL CAPS ratio
  const capsWords = words.filter(w => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w));
  if (wordCount > 0 && capsWords.length / wordCount > 0.30) {
    score += 10;
    flags.push('excessive_caps');
  }

  // Sentiment extreme (5-star with only superlatives, no caveats)
  const caveatPatterns = /\bbut\b|\bhowever\b|\bthough\b|\bexcept\b|\bdownside\b|\bcon\b|\bwish\b|\bcould be\b|\bnot quite\b/i;
  if (review.rating === 5 && wordCount < 50 && !caveatPatterns.test(text)) {
    score += 10;
    flags.push('extreme_positive_no_caveats');
  }

  // ── Reviewer signals ─────────────────────────────────────────────────────────

  // Unverified purchase (Amazon)
  if (review.verified === false) {
    score += 25;
    flags.push('unverified_purchase');
  }

  // Reviewer only posts 5-star or only 1-star
  if (reviewerHistory.length >= 3) {
    const ratings = reviewerHistory.map(r => r.rating);
    const uniqueRatings = new Set(ratings);
    if (uniqueRatings.size === 1 && (ratings[0] === 5 || ratings[0] === 1)) {
      score += 20;
      flags.push('single_rating_history');
    }
  }

  // Reviews posted in rapid succession (same day as another review by same reviewer)
  if (reviewerHistory.length >= 3) {
    const dates = reviewerHistory.map(r => r.date ? new Date(r.date).toDateString() : null).filter(Boolean);
    const dateCounts = {};
    dates.forEach(d => { dateCounts[d] = (dateCounts[d] || 0) + 1; });
    if (Object.values(dateCounts).some(c => c >= 3)) {
      score += 15;
      flags.push('rapid_succession_reviews');
    }
  }

  // Cap at 100
  score = Math.min(score, 100);

  // Confidence
  let confidence;
  if (flags.length >= 4) confidence = 'high';
  else if (flags.length >= 2) confidence = 'medium';
  else confidence = 'low';

  // Verdict
  let verdict;
  if (score >= 65) verdict = 'Likely Fake';
  else if (score >= 35) verdict = 'Suspicious';
  else verdict = 'Looks Legit';

  return {
    reviewId: review.id || review.reviewId || null,
    fakeScore: score,
    confidence,
    flags,
    verdict,
  };
}

/**
 * Analyse an array of reviews for a product.
 * Returns per-review scores + overall product summary.
 */
function analyzeProduct(reviews, productMeta = {}) {
  if (!reviews || reviews.length === 0) {
    return {
      productScore: 0,
      verdict: 'No Reviews',
      totalReviews: 0,
      analyzedReviews: 0,
      flaggedReviews: 0,
      adjustedRating: null,
      realRating: null,
      reviews: [],
    };
  }

  // Group reviewer histories by reviewer id for cross-review signals
  const byReviewer = {};
  reviews.forEach(r => {
    const key = r.reviewerId || r.reviewer || 'anon';
    if (!byReviewer[key]) byReviewer[key] = [];
    byReviewer[key].push(r);
  });

  const scored = reviews.map(r => {
    const key = r.reviewerId || r.reviewer || 'anon';
    return scoreReview(r, byReviewer[key]);
  });

  // ── Product-level signals ─────────────────────────────────────────────────

  let productBonus = 0;
  const productFlags = [];

  // Bimodal distribution (lots of 1s and 5s, few 2-4)
  const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  reviews.forEach(r => {
    const star = Math.round(r.rating);
    if (star >= 1 && star <= 5) ratingCounts[star]++;
  });
  const total = reviews.length;
  const extremes = (ratingCounts[1] + ratingCounts[5]) / total;
  const middles = (ratingCounts[2] + ratingCounts[3] + ratingCounts[4]) / total;
  if (extremes > 0.70 && middles < 0.15) {
    productBonus += 25;
    productFlags.push('bimodal_rating_distribution');
  }

  // Sudden rating spike — detect if many reviews have the same or very close dates
  const dateCounts = {};
  reviews.forEach(r => {
    if (r.date) {
      const d = new Date(r.date).toISOString().split('T')[0];
      dateCounts[d] = (dateCounts[d] || 0) + 1;
    }
  });
  const maxDayCount = Math.max(...Object.values(dateCounts), 0);
  if (maxDayCount / total > 0.25) {
    productBonus += 20;
    productFlags.push('rating_spike_detected');
  }

  // Average per-review fake score
  const avgReviewScore = scored.reduce((s, r) => s + r.fakeScore, 0) / scored.length;
  const productScore = Math.min(Math.round(avgReviewScore + productBonus), 100);

  const flaggedReviews = scored.filter(r => r.fakeScore >= 50).length;

  // Adjusted rating: exclude reviews scored >= 65 (likely fake)
  const legitimateReviews = reviews.filter((_, i) => scored[i].fakeScore < 65);
  const realRating = total > 0
    ? +(reviews.reduce((s, r) => s + (r.rating || 0), 0) / total).toFixed(1)
    : null;
  const adjustedRating = legitimateReviews.length > 0
    ? +(legitimateReviews.reduce((s, r) => s + (r.rating || 0), 0) / legitimateReviews.length).toFixed(1)
    : realRating;

  let verdict;
  if (productScore >= 65) verdict = 'Likely Fake';
  else if (productScore >= 35) verdict = 'Suspicious';
  else verdict = 'Looks Legit';

  return {
    productScore,
    verdict,
    productFlags,
    totalReviews: productMeta.totalReviews || total,
    analyzedReviews: total,
    flaggedReviews,
    adjustedRating,
    realRating,
    reviews: scored,
  };
}

module.exports = { analyzeProduct, scoreReview };

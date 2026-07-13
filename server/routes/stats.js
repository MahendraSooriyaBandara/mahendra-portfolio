const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  recordVisit,
  getPublicStats,
  getAdminStats,
  resetStats
} = require('../lib/stats');

const router = express.Router();

/**
 * Pull the client IP out of the request, honoring Render's x-forwarded-for
 * header (Render puts the visitor's real IP first in that list). Falls
 * back to the socket address for local dev.
 */
function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) {
    const first = xf.split(',')[0].trim();
    if (first) return first;
  }
  return (req.socket && req.socket.remoteAddress) || '';
}

// Public — called by the site on page load. Rate-limited implicitly via
// per-fingerprint dedup: repeat visits from the same browser/IP within
// the current month only bump pageviews, not unique count.
router.post('/visit', (req, res) => {
  try {
    const ip = clientIp(req);
    const ua = req.headers['user-agent'] || '';
    const { stats } = recordVisit(ip, ua);
    res.json(stats);
  } catch (err) {
    console.warn('[stats] visit failed:', err.message);
    res.status(500).json({ error: 'Failed to record visit' });
  }
});

// Public — read-only monthly counter for the footer widget.
router.get('/visitors', (_req, res) => {
  res.json(getPublicStats());
});

// Admin — richer view with per-month history.
router.get('/admin', requireAuth, (_req, res) => {
  res.json(getAdminStats());
});

// Admin — wipe counters back to zero. Useful before publishing publicly.
router.post('/reset', requireAuth, (_req, res) => {
  res.json(resetStats());
});

module.exports = router;

/**
 * Visitor stats — records anonymous, deduplicated visits and exposes
 * monthly counts for the public site.
 *
 * Design notes:
 *  - Storage lives in server/data/stats.json and rides on the same
 *    auto-persist rail as the rest of the admin data, so counts survive
 *    Render's ephemeral filesystem across redeploys.
 *  - Deduplication uses a SHA-256 hash of (IP + user-agent + secret salt),
 *    kept only for the current month. When the month rolls over, the
 *    fingerprint list is cleared but the count history is retained.
 *  - Persisting to git every single visit would produce a runaway commit
 *    stream, so we debounce stats pushes to STATS_PERSIST_DEBOUNCE_MS
 *    (default 5 min). Local disk is written on every visit though, so
 *    even a short-lived container flushes its state on graceful shutdown.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { persistChange } = require('./persist');

const STATS_PATH = path.join(__dirname, '..', 'data', 'stats.json');
const STATS_SALT = process.env.STATS_SALT || 'mahendra-portfolio-stats-salt-v1';
const STATS_PERSIST_DEBOUNCE_MS = Number(process.env.STATS_PERSIST_DEBOUNCE_MS) || 5 * 60 * 1000;
const MAX_FINGERPRINTS = 50000; // hard cap so a burst of unique visitors can't grow the file forever

let state = null;
let persistTimer = null;

function currentMonthKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function defaultStats() {
  const month = currentMonthKey();
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentMonth: month,
    currentFingerprints: [],
    monthly: { [month]: { unique: 0, pageviews: 0 } },
    totalUnique: 0,
    totalPageviews: 0
  };
}

function ensureLoaded() {
  if (state) return;
  try {
    const raw = fs.readFileSync(STATS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    state = {
      ...defaultStats(),
      ...parsed,
      monthly: parsed.monthly && typeof parsed.monthly === 'object' ? parsed.monthly : {},
      currentFingerprints: Array.isArray(parsed.currentFingerprints) ? parsed.currentFingerprints : []
    };
  } catch (_) {
    state = defaultStats();
    writeToDisk();
  }
}

function ensureCurrentMonth() {
  ensureLoaded();
  const now = currentMonthKey();
  if (state.currentMonth !== now) {
    // Month has rolled over. Preserve prior month's totals; start fresh
    // for the new month's fingerprint dedup.
    state.currentMonth = now;
    state.currentFingerprints = [];
  }
  if (!state.monthly[state.currentMonth]) {
    state.monthly[state.currentMonth] = { unique: 0, pageviews: 0 };
  }
}

function writeToDisk() {
  state.updatedAt = new Date().toISOString();
  try {
    fs.writeFileSync(STATS_PATH, JSON.stringify(state, null, 2));
  } catch (err) {
    console.warn('[stats] write failed:', err.message);
  }
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistChange('stats update');
  }, STATS_PERSIST_DEBOUNCE_MS);
}

function fingerprintOf(ip, userAgent) {
  const raw = `${ip || 'unknown'}|${userAgent || 'unknown'}|${STATS_SALT}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function recordVisit(ip, userAgent) {
  ensureCurrentMonth();
  const fp = fingerprintOf(ip, userAgent);
  const bucket = state.monthly[state.currentMonth];

  bucket.pageviews += 1;
  state.totalPageviews += 1;

  const isNewUnique = !state.currentFingerprints.includes(fp);
  if (isNewUnique) {
    state.currentFingerprints.push(fp);
    // Cap the fingerprint list; if we're over the limit, drop the oldest.
    // Losing a fingerprint just means that visitor might get counted again
    // on their next hit — acceptable degradation for extreme traffic.
    if (state.currentFingerprints.length > MAX_FINGERPRINTS) {
      state.currentFingerprints.shift();
    }
    bucket.unique += 1;
    state.totalUnique += 1;
  }

  writeToDisk();
  schedulePersist();

  return { newUnique: isNewUnique, stats: getPublicStats() };
}

function getPublicStats() {
  ensureCurrentMonth();
  const bucket = state.monthly[state.currentMonth] || { unique: 0, pageviews: 0 };
  return {
    currentMonth: state.currentMonth,
    monthly: { unique: bucket.unique, pageviews: bucket.pageviews },
    total: { unique: state.totalUnique, pageviews: state.totalPageviews }
  };
}

function getAdminStats() {
  ensureCurrentMonth();
  const history = Object.entries(state.monthly)
    .map(([month, v]) => ({
      month,
      unique: v.unique || 0,
      pageviews: v.pageviews || 0
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
  return {
    ...getPublicStats(),
    history,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    trackedFingerprints: state.currentFingerprints.length
  };
}

function resetStats() {
  state = defaultStats();
  writeToDisk();
  persistChange('stats reset');
  return getPublicStats();
}

/**
 * Ensure any queued stats push is committed before the process exits.
 * Called from server.js SIGTERM/SIGINT handler.
 */
function flushOnShutdown() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (state) writeToDisk();
  // Return a promise so the caller can await it if desired.
  return Promise.resolve();
}

module.exports = {
  recordVisit,
  getPublicStats,
  getAdminStats,
  resetStats,
  flushOnShutdown
};

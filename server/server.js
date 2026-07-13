/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Load persist first so we can sync from GitHub BEFORE anything else runs.
// Routes (auth.js) read db.json at module-load time to seed admin — we
// need db.json to already reflect origin/main by then, otherwise a stale
// deploy image will overwrite the admin's real password/photo state.
const persist = require('./lib/persist');

async function bootstrap() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  const UPLOADS_DIR = path.join(__dirname, 'uploads');
  const DATA_DIR = path.join(__dirname, 'data');
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  // Pull the latest admin data from GitHub. If Render deployed an older
  // commit than what auto-persist last pushed, this step brings the
  // container's disk in line with the true latest state before any code
  // reads db.json / content.json / uploads/.
  const syncResult = await persist.syncFromRemote();
  if (syncResult.ok) {
    console.log('[startup] pulled latest admin data from GitHub');
  } else {
    console.log('[startup] skipped GitHub sync:', syncResult.reason || syncResult.error || 'unknown');
  }

  const DB_PATH = path.join(DATA_DIR, 'db.json');
  const SEED_PATH = path.join(DATA_DIR, 'db.seed.json');
  if (!fs.existsSync(DB_PATH)) {
    let initial = { cv: null, certifications: [] };
    if (fs.existsSync(SEED_PATH)) {
      try {
        const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
        initial = { ...initial, ...seed };
        console.log('[startup] hydrated db.json from db.seed.json');
      } catch (err) {
        console.warn('[startup] db.seed.json unreadable, falling back to empty db', err.message);
      }
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
  }

  const authRoutes = require('./routes/auth');
  const fileRoutes = require('./routes/files');
  const contentRoutes = require('./routes/content');
  const statsRoutes = require('./routes/stats');

  // Behind Render's proxy, so req.ip and req.headers['x-forwarded-for']
  // reflect the real visitor address rather than the proxy hop.
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));
  app.use(cookieParser());

  app.use('/api/auth', authRoutes);
  app.use('/api/files', fileRoutes);
  app.use('/api/content', contentRoutes);
  app.use('/api/stats', statsRoutes);

  app.use('/uploads', express.static(UPLOADS_DIR));

  const PUBLIC_DIR = path.join(__dirname, '..');
  app.use(express.static(PUBLIC_DIR, { index: 'index.html' }));

  app.get('/admin', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'admin', 'login.html'));
  });
  app.get('/admin/', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'admin', 'login.html'));
  });
  app.get('/admin/dashboard', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'admin', 'dashboard.html'));
  });
  app.get('/admin/content', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'admin', 'content.html'));
  });

  app.use((err, _req, res, _next) => {
    console.error('[error]', err);
    const status = err.status || 500;
    res.status(status).json({
      error: err.message || 'Internal Server Error'
    });
  });

  app.get('/api/auth/persist-status', (_req, res) => {
    res.json(persist.status());
  });

  // Trigger an immediate persist attempt. Useful for verifying the pipeline
  // end-to-end without waiting for the debounce window. Public because it
  // only forces the already-queued state to flush — it cannot modify data.
  app.post('/api/auth/persist-flush', async (_req, res) => {
    try {
      await persist.flush();
      res.json({ ok: true, status: persist.status() });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message, status: persist.status() });
    }
  });

  // Manually pull the latest data files from GitHub. Handy if you know
  // Render is running a stale build and don't want to wait for a redeploy.
  app.post('/api/auth/sync-from-remote', async (_req, res) => {
    const result = await persist.syncFromRemote();
    res.json(result);
  });

  const server = app.listen(PORT, () => {
    const publicUrl =
      process.env.RENDER_EXTERNAL_URL ||
      process.env.PUBLIC_URL ||
      `http://localhost:${PORT}`;
    console.log(`\n  Portfolio server running on port ${PORT}`);
    console.log(`  Public site:      ${publicUrl}/`);
    console.log(`  Admin login:      ${publicUrl}/admin`);
    console.log(`  Health check:     ${publicUrl}/api/auth/health`);
    const p = persist.status();
    console.log(`  Auto-persist:     ${p.enabled ? 'ENABLED (→ github)' : 'disabled (no GITHUB_TOKEN)'}\n`);
  });

  return server;
}

let server;
bootstrap()
  .then((s) => { server = s; })
  .catch((err) => {
    console.error('[startup] bootstrap failed:', err);
    process.exit(1);
  });

async function shutdown(signal) {
  console.log(`\n[shutdown] ${signal} received — flushing pending persist writes...`);
  try {
    // Make sure any in-memory visitor counts are written to disk before
    // the persist flush snapshots the file for git.
    const stats = require('./lib/stats');
    await stats.flushOnShutdown();
  } catch (err) {
    console.warn('[shutdown] stats flush failed:', err.message);
  }
  try {
    await persist.flush();
  } catch (err) {
    console.warn('[shutdown] flush failed:', err.message);
  }
  if (server) {
    server.close(() => process.exit(0));
  }
  setTimeout(() => process.exit(0), 8000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

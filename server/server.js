/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const contentRoutes = require('./routes/content');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'db.json');
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(
    DB_PATH,
    JSON.stringify({ cv: null, certifications: [] }, null, 2)
  );
}

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/content', contentRoutes);

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

app.listen(PORT, () => {
  const publicUrl =
    process.env.RENDER_EXTERNAL_URL ||
    process.env.PUBLIC_URL ||
    `http://localhost:${PORT}`;
  console.log(`\n  Portfolio server running on port ${PORT}`);
  console.log(`  Public site:      ${publicUrl}/`);
  console.log(`  Admin login:      ${publicUrl}/admin`);
  console.log(`  Health check:     ${publicUrl}/api/auth/health\n`);
});

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const { readDB, writeDB } = require('../lib/db');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const uniq = crypto.randomBytes(8).toString('hex');
    const safeName = file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80);
    cb(null, `${Date.now()}_${uniq}_${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      return cb(new Error('File type not allowed. Use PDF, DOC, DOCX, JPG, PNG, or WEBP.'));
    }
    cb(null, true);
  }
});

function deleteFileSafe(filename) {
  if (!filename) return;
  const abs = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(abs)) {
    try { fs.unlinkSync(abs); } catch (_) {}
  }
}

router.get('/cv', (_req, res) => {
  const db = readDB();
  if (!db.cv) return res.json({ cv: null });
  res.json({
    cv: {
      originalName: db.cv.originalName,
      url: `/uploads/${db.cv.filename}`,
      uploadedAt: db.cv.uploadedAt,
      size: db.cv.size
    }
  });
});

router.get('/cv/download', (_req, res) => {
  const db = readDB();
  if (!db.cv) return res.status(404).json({ error: 'No CV uploaded yet' });
  const abs = path.join(UPLOADS_DIR, db.cv.filename);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'CV file missing' });
  res.download(abs, db.cv.originalName || 'CV.pdf');
});

router.post('/cv', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const db = readDB();
  if (db.cv) deleteFileSafe(db.cv.filename);

  db.cv = {
    filename: req.file.filename,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    uploadedAt: new Date().toISOString()
  };
  writeDB(db);

  res.json({ success: true, cv: db.cv });
});

router.delete('/cv', requireAuth, (_req, res) => {
  const db = readDB();
  if (db.cv) deleteFileSafe(db.cv.filename);
  db.cv = null;
  writeDB(db);
  res.json({ success: true });
});

router.get('/certs', (_req, res) => {
  const db = readDB();
  const list = (db.certifications || []).map((c) => ({
    id: c.id,
    title: c.title,
    issuer: c.issuer,
    year: c.year,
    originalName: c.originalName,
    url: `/uploads/${c.filename}`,
    uploadedAt: c.uploadedAt,
    size: c.size
  }));
  res.json({ certifications: list });
});

// Certificate downloads are restricted to the admin (used by the admin dashboard).
// Public visitors can only preview certificates via the modal.
router.get('/certs/:id/download', requireAuth, (req, res) => {
  const db = readDB();
  const cert = (db.certifications || []).find((c) => c.id === req.params.id);
  if (!cert) return res.status(404).json({ error: 'Certification not found' });
  const abs = path.join(UPLOADS_DIR, cert.filename);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File missing' });
  res.download(abs, cert.originalName || `${cert.title}.pdf`);
});

router.post('/certs', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { title, issuer, year } = req.body || {};
  if (!title) {
    deleteFileSafe(req.file.filename);
    return res.status(400).json({ error: 'Certification title is required' });
  }

  const db = readDB();
  const cert = {
    id: crypto.randomBytes(6).toString('hex'),
    title: String(title).trim(),
    issuer: issuer ? String(issuer).trim() : '',
    year: year ? String(year).trim() : '',
    filename: req.file.filename,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    uploadedAt: new Date().toISOString()
  };
  db.certifications = db.certifications || [];
  db.certifications.push(cert);
  writeDB(db);

  res.json({ success: true, certification: cert });
});

router.delete('/certs/:id', requireAuth, (req, res) => {
  const db = readDB();
  const idx = (db.certifications || []).findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Certification not found' });
  const [removed] = db.certifications.splice(idx, 1);
  deleteFileSafe(removed.filename);
  writeDB(db);
  res.json({ success: true });
});

router.use((err, _req, res, _next) => {
  if (err && err.message) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Upload failed' });
});

module.exports = router;

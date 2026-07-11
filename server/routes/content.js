const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const {
  readContent,
  writeContent,
  updateSection,
  upsertListItem,
  deleteListItem,
  reorderList,
  resetToDefault
} = require('../lib/content');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const uniq = crypto.randomBytes(6).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `profile_${Date.now()}_${uniq}${ext}`);
  }
});
const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_MIMES.has(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, WEBP, or GIF images are allowed.'));
    }
    cb(null, true);
  }
});

function unlinkSafe(filename) {
  if (!filename) return;
  const abs = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(abs)) {
    try { fs.unlinkSync(abs); } catch (_) {}
  }
}

const LIST_SECTIONS = new Set([
  'skills',
  'experience',
  'projects',
  'education',
  'references',
  'languages',
  'interests',
  'music'
]);

router.get('/', (_req, res) => {
  res.json(readContent());
});

router.get('/:section', (req, res) => {
  const content = readContent();
  if (!(req.params.section in content)) {
    return res.status(404).json({ error: 'Section not found' });
  }
  res.json({ [req.params.section]: content[req.params.section] });
});

router.put('/:section', requireAuth, (req, res) => {
  const { section } = req.params;
  const value = req.body && req.body.value !== undefined ? req.body.value : req.body;
  if (value === undefined) return res.status(400).json({ error: 'Missing value' });
  const updated = updateSection(section, value);
  res.json({ success: true, [section]: updated[section] });
});

router.post('/:section/item', requireAuth, (req, res) => {
  const { section } = req.params;
  if (!LIST_SECTIONS.has(section)) {
    return res.status(400).json({ error: `Section "${section}" is not a list` });
  }
  const item = req.body || {};
  const saved = upsertListItem(section, item);
  res.json({ success: true, item: saved });
});

router.delete('/:section/item/:id', requireAuth, (req, res) => {
  const { section, id } = req.params;
  if (!LIST_SECTIONS.has(section)) {
    return res.status(400).json({ error: `Section "${section}" is not a list` });
  }
  const ok = deleteListItem(section, id);
  if (!ok) return res.status(404).json({ error: 'Item not found' });
  res.json({ success: true });
});

router.post('/:section/reorder', requireAuth, (req, res) => {
  const { section } = req.params;
  if (!LIST_SECTIONS.has(section)) {
    return res.status(400).json({ error: `Section "${section}" is not a list` });
  }
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  const list = reorderList(section, ids);
  res.json({ success: true, [section]: list });
});

router.post('/_reset', requireAuth, (_req, res) => {
  const defaults = resetToDefault();
  res.json({ success: true, content: defaults });
});

/* ============ PROFILE PHOTO UPLOAD ============ */
router.post('/profile/photo', requireAuth, uploadImage.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  const content = readContent();
  const profile = content.profile || {};
  if (profile.photoFilename) unlinkSafe(profile.photoFilename);
  profile.photoFilename = req.file.filename;
  profile.photoUrl = `/uploads/${req.file.filename}`;
  content.profile = profile;
  writeContent(content, 'upload profile photo');
  res.json({ success: true, photoUrl: profile.photoUrl });
});

router.delete('/profile/photo', requireAuth, (_req, res) => {
  const content = readContent();
  const profile = content.profile || {};
  if (profile.photoFilename) unlinkSafe(profile.photoFilename);
  delete profile.photoFilename;
  delete profile.photoUrl;
  content.profile = profile;
  writeContent(content, 'remove profile photo');
  res.json({ success: true });
});

router.use((err, _req, res, _next) => {
  if (err && err.message) return res.status(400).json({ error: err.message });
  res.status(500).json({ error: 'Request failed' });
});

module.exports = router;

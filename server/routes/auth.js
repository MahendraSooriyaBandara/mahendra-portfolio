const express = require('express');
const bcrypt = require('bcryptjs');
const { signToken, requireAuth, TOKEN_COOKIE } = require('../middleware/auth');
const { getAdmin, setAdmin } = require('../lib/db');

const router = express.Router();

function seedAdminIfMissing() {
  let admin = getAdmin();
  if (admin && admin.username && admin.passwordHash) return admin;

  const seedUsername = process.env.ADMIN_USERNAME || 'admin';
  const seedPassword = process.env.ADMIN_PASSWORD || 'changeme123';
  const passwordHash = bcrypt.hashSync(seedPassword, 10);
  admin = { username: seedUsername, passwordHash, updatedAt: new Date().toISOString() };
  setAdmin(admin);
  console.log(`[auth] Admin account seeded from .env — username: "${seedUsername}"`);
  return admin;
}

seedAdminIfMissing();

router.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const admin = seedAdminIfMissing();

  if (username !== admin.username) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signToken({ sub: admin.username, role: 'admin' });

  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.json({ success: true, token, user: { username: admin.username } });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(TOKEN_COOKIE);
  res.json({ success: true });
});

router.get('/me', requireAuth, (req, res) => {
  const admin = getAdmin();
  res.json({
    user: {
      username: admin ? admin.username : req.user.sub,
      updatedAt: admin ? admin.updatedAt : null
    }
  });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (confirmPassword !== undefined && confirmPassword !== newPassword) {
    return res.status(400).json({ error: 'New password and confirmation do not match' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ error: 'New password must be different from the current one' });
  }

  const admin = getAdmin();
  if (!admin) return res.status(500).json({ error: 'Admin not configured' });

  const ok = await bcrypt.compare(currentPassword, admin.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

  const newHash = bcrypt.hashSync(newPassword, 10);
  setAdmin({
    ...admin,
    passwordHash: newHash,
    updatedAt: new Date().toISOString()
  });

  res.clearCookie(TOKEN_COOKIE);
  res.json({ success: true, message: 'Password updated. Please log in again.' });
});

router.post('/change-username', requireAuth, async (req, res) => {
  const { currentPassword, newUsername } = req.body || {};
  if (!currentPassword || !newUsername) {
    return res.status(400).json({ error: 'Current password and new username are required' });
  }
  const trimmed = String(newUsername).trim();
  if (trimmed.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }

  const admin = getAdmin();
  if (!admin) return res.status(500).json({ error: 'Admin not configured' });

  const ok = await bcrypt.compare(currentPassword, admin.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

  setAdmin({
    ...admin,
    username: trimmed,
    updatedAt: new Date().toISOString()
  });

  res.clearCookie(TOKEN_COOKIE);
  res.json({ success: true, message: 'Username updated. Please log in again.' });
});

module.exports = router;

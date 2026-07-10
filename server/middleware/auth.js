const jwt = require('jsonwebtoken');

const JWT_SECRET =
  process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION_super_secret_key';
const TOKEN_COOKIE = 'portfolio_token';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const bearer = req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const token = bearer || req.cookies[TOKEN_COOKIE];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
}

module.exports = { signToken, verifyToken, requireAuth, TOKEN_COOKIE };

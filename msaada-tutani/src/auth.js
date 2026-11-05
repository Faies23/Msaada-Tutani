const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production');
  SECRET = 'dev-only-secret';
  console.warn('[auth] JWT_SECRET not set; using a development secret.');
}

const hashPassword = (p) => bcrypt.hash(p, 10);
const verifyPassword = (p, h) => bcrypt.compare(p, h);
const signToken = (u) => jwt.sign({ id: u.id, role: u.role }, SECRET, { expiresIn: '30d' });

function readToken(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  try { return jwt.verify(h.slice(7), SECRET); } catch { return null; }
}

// Attaches req.user when a valid token is present, but never refuses the request.
function optionalAuth(req, res, next) { req.user = readToken(req); next(); }

// Refuses unless signed in with one of the given roles.
function requireRole(...roles) {
  return (req, res, next) => {
    const u = readToken(req);
    if (!u) return res.status(401).json({ error: 'auth_required' });
    if (roles.length && !roles.includes(u.role)) return res.status(403).json({ error: 'forbidden' });
    req.user = u;
    next();
  };
}

module.exports = { hashPassword, verifyPassword, signToken, optionalAuth, requireRole };

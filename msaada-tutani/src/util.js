const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const bad = (code) => new HttpError(400, code);

// Wraps an async handler so thrown errors reach the error middleware.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function str(v, { min = 0, max = 200, field }) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min || s.length > max) throw bad('invalid_' + field);
  return s;
}
function oneOf(v, list, field) {
  if (!list.includes(v)) throw bad('invalid_' + field);
  return v;
}
function email(v) {
  const s = str(v, { min: 3, max: 160, field: 'email' }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw bad('invalid_email');
  return s;
}
// Tanzanian mobile: accepts 07XXXXXXXX, 06XXXXXXXX, +2557..., 2557...; stores +255XXXXXXXXX.
function phone(v) {
  const d = String(v || '').replace(/[\s-]/g, '');
  const m = d.match(/^(?:\+?255|0)([67]\d{8})$/);
  if (!m) throw bad('invalid_phone');
  return '+255' + m[1];
}
function password(v) {
  if (typeof v !== 'string' || v.length < 8 || v.length > 200) throw bad('weak_password');
  return v;
}
function amount(v, field = 'amount') {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 500 || n > 500000000) throw bad('invalid_' + field);
  return n;
}
function id(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, 'not_found');
  return n;
}

// Short, unambiguous code a giver keeps, e.g. MT-7H3K-Q9WM.
function trackingCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += alphabet[bytes[i] % alphabet.length];
  return 'MT-' + s.slice(0, 4) + '-' + s.slice(4);
}

// In-memory limiter: fine for one instance. Resets on restart.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const e = hits.get(key);
    if (!e || now - e.start > windowMs) { hits.set(key, { start: now, n: 1 }); return next(); }
    if (++e.n > max) return res.status(429).json({ error: 'too_many_requests' });
    next();
  };
}

module.exports = { HttpError, bad, h, str, oneOf, email, phone, password, amount, id, trackingCode, rateLimit };

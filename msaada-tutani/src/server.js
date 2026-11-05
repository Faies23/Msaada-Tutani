require('dotenv').config();
const path = require('path');
const express = require('express');
const { HttpError } = require('./util');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '));
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

// Send every visitor to one address, e.g. msaadatutani.com -> www.msaadatutani.com.
const CANONICAL = (process.env.CANONICAL_HOST || '').toLowerCase();
if (CANONICAL) {
  app.use((req, res, next) => {
    const host = String(req.headers.host || '').toLowerCase();
    if (host && host !== CANONICAL && !host.startsWith('localhost') && !host.endsWith('.onrender.com') && req.method === 'GET') {
      return res.redirect(301, 'https://' + CANONICAL + req.originalUrl);
    }
    next();
  });
}

app.use(express.json({ limit: '20kb' }));

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/me', require('./routes/donor.routes'));
app.use('/api/inst', require('./routes/institution.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api', require('./routes/public.routes'));
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

const pub = path.join(__dirname, '..', 'public');
app.use(express.static(pub, { maxAge: '1h' }));
// Single-page app: every other path serves the shell.
app.get('*', (req, res) => res.sendFile(path.join(pub, 'index.html')));

app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.code });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log('Msaada Tutani on http://localhost:' + port));

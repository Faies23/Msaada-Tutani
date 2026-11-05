const router = require('express').Router();
const { query, tx } = require('../db');
const { hashPassword, verifyPassword, signToken, requireRole } = require('../auth');
const crypto = require('crypto');
const { REGIONS, LEVELS, OWNERSHIP, ORG_TYPES } = require('../tz');
const v = require('../util');
const mail = require('../mail');

const limiter = v.rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

// Donor: an individual or an organisation. The alias is the only name shown publicly; the
// rest (full name, organisation details, phone) is private and used for receipts and contact.
router.post('/donor/signup', limiter, v.h(async (req, res) => {
  const b = req.body || {};
  const type = v.oneOf(b.donor_type || 'individual', ['individual', 'organisation'], 'donor_type');
  const email = v.email(b.email);
  const pw = v.password(b.password);
  const phone = b.phone ? v.phone(b.phone) : null;
  const region = b.region ? v.oneOf(b.region, REGIONS, 'region') : null;
  let fullName = null, orgName = null, orgType = null, orgReg = null, alias;
  if (type === 'organisation') {
    orgName = v.str(b.org_name, { min: 2, max: 120, field: 'org_name' });
    orgType = v.oneOf(b.org_type, ORG_TYPES, 'org_type');
    orgReg = v.str(b.org_reg_no || '', { max: 40, field: 'org_reg_no' }) || null;
    fullName = v.str(b.contact_name, { min: 3, max: 80, field: 'contact_name' });
    alias = v.str(b.alias || orgName, { min: 2, max: 60, field: 'alias' });
  } else {
    fullName = v.str(b.full_name || '', { max: 80, field: 'full_name' }) || null;
    alias = v.str(b.alias, { min: 2, max: 32, field: 'alias' });
  }
  const hide = !!b.hide_from_board;
  const hash = await hashPassword(pw);
  try {
    const { rows } = await query(
      `insert into users (role, email, password_hash, alias, hide_from_board, donor_type, full_name,
                          org_name, org_type, org_reg_no, phone, region)
       values ('donor', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id, role`,
      [email, hash, alias, hide, type, fullName, orgName, orgType, orgReg, phone, region]);
    res.status(201).json({ token: signToken(rows[0]), role: 'donor' });
  } catch (e) {
    if (e.code === '23505') throw new v.HttpError(409, 'email_taken');
    throw e;
  }
}));

// Institution: one account per registration number. Starts as 'pending' until an admin verifies it.
router.post('/institution/signup', limiter, v.h(async (req, res) => {
  const b = req.body || {};
  const kind = v.oneOf(b.kind, ['health', 'school'], 'kind');
  const data = {
    name: v.str(b.name, { min: 3, max: 120, field: 'name' }),
    reg_no: v.str(b.reg_no, { min: 2, max: 40, field: 'reg_no' }).toUpperCase(),
    region: v.oneOf(b.region, REGIONS, 'region'),
    district: v.str(b.district, { min: 2, max: 60, field: 'district' }),
    ownership: v.oneOf(b.ownership, OWNERSHIP, 'ownership'),
    level: v.oneOf(b.level, LEVELS[kind], 'level'),
    contact_name: v.str(b.contact_name, { min: 3, max: 80, field: 'contact_name' }),
    contact_title: v.str(b.contact_title || '', { max: 80, field: 'contact_title' }),
    phone: v.phone(b.phone)
  };
  // Picked from the catalogue? Then it must exist, match the sector, and not be claimed already.
  let catalogueId = null;
  if (b.catalogue_id) {
    const c = await query('select id, kind from catalogue where id = $1', [v.id(b.catalogue_id)]);
    if (!c.rows[0] || c.rows[0].kind !== kind) throw v.bad('invalid_catalogue');
    catalogueId = c.rows[0].id;
  }
  const email = v.email(b.email);
  const hash = await hashPassword(v.password(b.password));

  try {
    const out = await tx(async (c) => {
      const u = await c.query(
        `insert into users (role, email, phone, password_hash) values ('institution', $1, $2, $3) returning id, role`,
        [email, data.phone, hash]);
      const ins = await c.query(
        `insert into institutions (user_id, name, kind, reg_no, region, district, ownership, level,
                                   contact_name, contact_title, phone, catalogue_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
        [u.rows[0].id, data.name, kind, data.reg_no, data.region, data.district, data.ownership,
         data.level, data.contact_name, data.contact_title || null, data.phone, catalogueId]);
      return { ...u.rows[0], institution_id: ins.rows[0].id };
    });
    mail.institutionRegistered(out.institution_id);
    res.status(201).json({ token: signToken(out), role: 'institution' });
  } catch (e) {
    if (e.code === '23505') {
      const c = String(e.constraint || '');
      throw new v.HttpError(409, c.includes('catalogue') ? 'already_registered' : c.includes('reg') ? 'reg_no_taken' : 'email_taken');
    }
    throw e;
  }
}));

router.post('/login', limiter, v.h(async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const { rows } = await query('select id, role, password_hash from users where email = $1', [email]);
  const ok = rows[0] && await verifyPassword(String(b.password || ''), rows[0].password_hash);
  if (!ok) throw new v.HttpError(401, 'bad_login');
  res.json({ token: signToken(rows[0]), role: rows[0].role });
}));

router.get('/me', requireRole(), v.h(async (req, res) => {
  const { rows } = await query(
    `select id, role, email, alias, hide_from_board, created_at, donor_type, full_name, org_name, org_type,
            org_reg_no, phone, region from users where id = $1`, [req.user.id]);
  if (!rows[0]) throw new v.HttpError(401, 'auth_required');
  const me = rows[0];
  if (me.role === 'institution') {
    const i = await query('select * from institutions where user_id = $1', [me.id]);
    me.institution = i.rows[0] || null;
  }
  res.json(me);
}));

// Password reset: always answers the same way so the form can't be used to find accounts.
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
router.post('/forgot', limiter, v.h(async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const { rows } = await query('select id from users where email = $1', [email]);
  if (rows[0]) {
    const token = crypto.randomBytes(32).toString('base64url');
    await query(`insert into password_resets (token_hash, user_id, expires_at) values ($1, $2, now() + interval '1 hour')`,
      [hashToken(token), rows[0].id]);
    mail.passwordReset(email, token);
  }
  res.json({ ok: true });
}));
router.post('/reset', limiter, v.h(async (req, res) => {
  const b = req.body || {};
  const pw = v.password(b.password);
  const { rows } = await query(
    `update password_resets set used_at = now()
     where token_hash = $1 and used_at is null and expires_at > now() returning user_id`, [hashToken(String(b.token || ''))]);
  if (!rows[0]) throw v.bad('reset_expired');
  await query('update users set password_hash = $2 where id = $1', [rows[0].user_id, await hashPassword(pw)]);
  const u = await query('select id, role from users where id = $1', [rows[0].user_id]);
  res.json({ token: signToken(u.rows[0]), role: u.rows[0].role });
}));

module.exports = router;

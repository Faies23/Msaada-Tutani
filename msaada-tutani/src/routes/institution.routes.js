const router = require('express').Router();
const { query, tx } = require('../db');
const { requireRole } = require('../auth');
const tz = require('../tz');
const v = require('../util');
const mail = require('../mail');

router.use(requireRole('institution'));

// Loads the signed-in account's institution onto req.inst.
router.use(v.h(async (req, res, next) => {
  const { rows } = await query('select * from institutions where user_id = $1', [req.user.id]);
  if (!rows[0]) throw new v.HttpError(403, 'forbidden');
  req.inst = rows[0];
  next();
}));

const mustBeVerified = (req, res, next) =>
  req.inst.status === 'verified' ? next() : next(new v.HttpError(403, 'not_verified'));

router.get('/overview', v.h(async (req, res) => {
  const { rows } = await query(`
    select
      (select count(*) from bills where institution_id = $1 and status = 'open')::int as open_bills,
      (select count(*) from bills where institution_id = $1 and status = 'cleared')::int as cleared_bills,
      (select coalesce(sum(c.amount_tzs),0) from contributions c join bills b on b.id = c.bill_id
        where b.institution_id = $1 and c.status = 'confirmed')::bigint as received_tzs,
      (select count(*) from contributions c join bills b on b.id = c.bill_id
        where b.institution_id = $1 and c.status = 'pending')::int as pending`, [req.inst.id]);
  res.json({ institution: req.inst, ...rows[0] });
}));

router.get('/bills', v.h(async (req, res) => {
  const { rows } = await query(
    `select b.*,
       (select count(*) from contributions c where c.bill_id = b.id and c.status = 'pending')::int as pending
     from bills b where b.institution_id = $1
     order by (b.status = 'open') desc, b.created_at desc limit 200`, [req.inst.id]);
  res.json(rows);
}));

router.post('/bills', mustBeVerified, v.h(async (req, res) => {
  const b = req.body || {};
  const cn = String(b.control_number || '').replace(/\s/g, '');
  if (!/^[A-Za-z0-9-]{6,30}$/.test(cn)) throw v.bad('invalid_control_number');
  const payVia = v.oneOf(b.pay_via || 'gepg', tz.PAY_VIA, 'pay_via');
  const detail = v.str(b.pay_via_detail || '', { max: 60, field: 'pay_via_detail' });
  if (payVia !== 'gepg' && !detail) throw v.bad('invalid_pay_via_detail');
  const amount = v.amount(b.amount);
  const category = v.oneOf(b.category, tz.CATEGORIES[req.inst.kind], 'category');
  const note = v.str(b.note || '', { max: 280, field: 'note' });
  let expires = null;
  if (b.expires_on) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.expires_on) || isNaN(Date.parse(b.expires_on))) throw v.bad('invalid_expires_on');
    if (new Date(b.expires_on) < new Date(new Date().toISOString().slice(0, 10))) throw v.bad('invalid_expires_on');
    expires = b.expires_on;
  }
  try {
    const { rows } = await query(
      `insert into bills (institution_id, control_number, pay_via, pay_via_detail, amount_tzs, category, note,
                          partial_allowed, expires_on)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [req.inst.id, cn.toUpperCase(), payVia, detail || null, amount, category, note || null,
       b.partial_allowed !== false, expires]);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') throw new v.HttpError(409, 'control_number_live');
    throw e;
  }
}));

// Close a bill that no longer needs help (e.g. the family paid, or it was a mistake).
router.post('/bills/:id/close', v.h(async (req, res) => {
  const { rows } = await query(
    `update bills set status = 'closed' where id = $1 and institution_id = $2 and status = 'open' returning id`,
    [v.id(req.params.id), req.inst.id]);
  if (!rows[0]) throw new v.HttpError(404, 'not_found');
  res.json({ ok: true });
}));

router.get('/contributions', v.h(async (req, res) => {
  const status = ['pending', 'confirmed', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  // The institution sees the receipt reference to match its records, never who gave.
  const { rows } = await query(
    `select c.id, c.amount_tzs, c.payment_ref, c.channel, c.status, c.created_at, c.reviewed_at,
            b.id as bill_id, b.control_number, b.category, b.amount_tzs as bill_amount, b.confirmed_tzs
     from contributions c join bills b on b.id = c.bill_id
     where b.institution_id = $1 and c.status = $2
     order by c.created_at ${status === 'pending' ? 'asc' : 'desc'} limit 200`, [req.inst.id, status]);
  res.json(rows);
}));

// Confirm a reported payment once it shows in GePG / the bank statement. The institution may
// correct the amount to what actually arrived.
router.post('/contributions/:id/confirm', v.h(async (req, res) => {
  const cid = v.id(req.params.id);
  const out = await tx(async (c) => {
    const { rows } = await c.query(
      `select c.id, c.amount_tzs, c.bill_id from contributions c join bills b on b.id = c.bill_id
       where c.id = $1 and b.institution_id = $2 and c.status = 'pending' for update of c`, [cid, req.inst.id]);
    if (!rows[0]) throw new v.HttpError(404, 'not_found');
    const received = req.body && req.body.amount != null ? v.amount(req.body.amount) : Number(rows[0].amount_tzs);
    await c.query(`update contributions set status = 'confirmed', amount_tzs = $2, reviewed_at = now() where id = $1`,
      [cid, received]);
    const b = await c.query(
      `update bills set confirmed_tzs = confirmed_tzs + $2,
         status = case when status = 'open' and confirmed_tzs + $2 >= amount_tzs then 'cleared' else status end,
         cleared_at = case when status = 'open' and confirmed_tzs + $2 >= amount_tzs then now() else cleared_at end
       where id = $1 returning id, status, amount_tzs, confirmed_tzs, cleared_at = now() as just_cleared`,
      [rows[0].bill_id, received]);
    return b.rows[0];
  });
  mail.paymentReviewed(cid, out.just_cleared);
  delete out.just_cleared;
  res.json({ ok: true, bill: out });
}));

router.post('/contributions/:id/reject', v.h(async (req, res) => {
  const { rows } = await query(
    `update contributions c set status = 'rejected', reviewed_at = now()
     from bills b where b.id = c.bill_id and c.id = $1 and b.institution_id = $2 and c.status = 'pending'
     returning c.id`, [v.id(req.params.id), req.inst.id]);
  if (!rows[0]) throw new v.HttpError(404, 'not_found');
  mail.paymentReviewed(rows[0].id, false);
  res.json({ ok: true });
}));

module.exports = router;

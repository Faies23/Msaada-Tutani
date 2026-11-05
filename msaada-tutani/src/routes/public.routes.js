const router = require('express').Router();
const { query } = require('../db');
const { optionalAuth } = require('../auth');
const tz = require('../tz');
const v = require('../util');
const mail = require('../mail');

// Columns that are safe to show anyone. Never the institution's phone, email or reg contact.
const PUBLIC_BILL = `
  b.id, b.control_number, b.pay_via, b.pay_via_detail, b.amount_tzs, b.confirmed_tzs,
  b.category, b.note, b.partial_allowed, b.expires_on, b.status, b.created_at, b.cleared_at,
  i.id as institution_id, i.name as institution_name, i.kind, i.level, i.ownership, i.region, i.district`;

const LIVE = `i.status = 'verified' and b.status = 'open' and (b.expires_on is null or b.expires_on >= current_date)`;

router.get('/meta', (req, res) => res.json(tz));

// Type-ahead for institution registration. Prefix matches first, then anywhere in the name.
router.get('/catalogue', v.h(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  if (q.length < 2) return res.json([]);
  const args = [q.toLowerCase().replace(/[\\%_]/g, '\\$&')];
  let kind = '';
  if (['health', 'school'].includes(req.query.kind)) { args.push(req.query.kind); kind = 'and c.kind = $2'; }
  const { rows } = await query(
    `select c.id, c.name, c.kind, c.level, c.ownership, c.region, c.district, c.reg_no,
            exists (select 1 from institutions i where i.catalogue_id = c.id) as registered
     from catalogue c
     where lower(c.name) like '%' || $1 || '%' ${kind}
     order by (lower(c.name) like $1 || '%') desc, length(c.name), c.name
     limit 8`, args);
  res.json(rows);
}));

router.get('/stats', v.h(async (req, res) => {
  const { rows } = await query(`
    select
      (select coalesce(sum(amount_tzs), 0) from contributions where status = 'confirmed')::bigint as total_tzs,
      (select count(*) from bills where status = 'cleared')::int as bills_cleared,
      (select count(*) from bills b join institutions i on i.id = b.institution_id where ${LIVE})::int as bills_open,
      (select count(*) from institutions where status = 'verified')::int as institutions,
      (select count(*) from contributions where status = 'confirmed')::int as gifts`);
  res.json(rows[0]);
}));

// The live board: open bills (plus ones cleared in the last day) ordered by latest activity,
// the newest confirmed payments, today's totals and an hourly series for the sparkline.
// The page polls this every few seconds and animates whatever changed.
router.get('/live', v.h(async (req, res) => {
  const [bills, feed, today, series] = await Promise.all([
    query(`
      select b.id, b.created_at, b.control_number, b.amount_tzs, b.confirmed_tzs, b.category, b.status,
             i.name as institution_name, i.region, i.kind, i.level,
             lp.reviewed_at as last_paid_at, lp.amount_tzs as last_paid_tzs
      from bills b join institutions i on i.id = b.institution_id
      left join lateral (
        select c.reviewed_at, c.amount_tzs from contributions c
        where c.bill_id = b.id and c.status = 'confirmed' order by c.reviewed_at desc limit 1) lp on true
      where i.status = 'verified' and (
        (b.status = 'open' and (b.expires_on is null or b.expires_on >= current_date))
        or (b.status = 'cleared' and b.cleared_at > now() - interval '24 hours'))
      order by greatest(b.created_at, coalesce(lp.reviewed_at, b.created_at)) desc
      limit 40`),
    query(`
      select c.id, c.amount_tzs, c.reviewed_at, b.id as bill_id, b.control_number, i.name as institution_name
      from contributions c join bills b on b.id = c.bill_id join institutions i on i.id = b.institution_id
      where c.status = 'confirmed' order by c.reviewed_at desc limit 15`),
    query(`
      select coalesce(sum(amount_tzs), 0)::bigint as cleared_today, count(*)::int as payments_today,
             (select coalesce(sum(amount_tzs), 0) from contributions where status = 'confirmed')::bigint as total_tzs
      from contributions where status = 'confirmed' and reviewed_at >= date_trunc('day', now())`),
    query(`
      select extract(epoch from date_trunc('hour', reviewed_at))::bigint * 1000 as t, sum(amount_tzs)::bigint as v
      from contributions where status = 'confirmed' and reviewed_at >= now() - interval '24 hours'
      group by 1 order by 1`)
  ]);
  res.json({ bills: bills.rows, feed: feed.rows, series: series.rows, ...today.rows[0] });
}));

router.get('/bills', v.h(async (req, res) => {
  const q = req.query;
  const where = [LIVE];
  const args = [];
  const add = (sql, val) => { args.push(val); where.push(sql.replace('?', '$' + args.length)); };

  if (q.kind && ['health', 'school'].includes(q.kind)) add('i.kind = ?', q.kind);
  if (q.region && tz.REGIONS.includes(q.region)) add('i.region = ?', q.region);
  if (q.ownership && tz.OWNERSHIP.includes(q.ownership)) add('i.ownership = ?', q.ownership);
  if (q.level && [...tz.LEVELS.health, ...tz.LEVELS.school].includes(q.level)) add('i.level = ?', q.level);
  if (q.q && String(q.q).trim()) {
    // Escape LIKE wildcards so a search for "%" matches a literal percent sign.
    args.push('%' + String(q.q).trim().slice(0, 60).replace(/[\\%_]/g, '\\$&') + '%');
    const n = '$' + args.length;
    where.push(`(i.name ilike ${n} or i.district ilike ${n} or b.control_number like ${n})`);
  }

  const sorts = {
    newest: 'b.created_at desc',
    expiring: 'b.expires_on asc nulls last, b.created_at desc',
    nearly: '(b.confirmed_tzs::numeric / b.amount_tzs) desc, b.created_at desc',
    smallest: '(b.amount_tzs - b.confirmed_tzs) asc'
  };
  const order = sorts[q.sort] || sorts.newest;
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 30, 1), 60);

  const { rows } = await query(
    `select ${PUBLIC_BILL} from bills b join institutions i on i.id = b.institution_id
     where ${where.join(' and ')} order by ${order} limit ${limit}`, args);
  res.json(rows);
}));

router.get('/bills/:id', v.h(async (req, res) => {
  const { rows } = await query(
    `select ${PUBLIC_BILL},
       (select count(*) from contributions c where c.bill_id = b.id and c.status = 'confirmed')::int as gifts
     from bills b join institutions i on i.id = b.institution_id
     where b.id = $1 and i.status = 'verified'`, [v.id(req.params.id)]);
  if (!rows[0]) throw new v.HttpError(404, 'not_found');
  res.json(rows[0]);
}));

// A giver reports a payment they made against the control number. Money never passes
// through this site; the institution confirms it against its own GePG / bank records.
router.post('/bills/:id/contributions',
  v.rateLimit({ windowMs: 10 * 60 * 1000, max: 20 }), optionalAuth,
  v.h(async (req, res) => {
    const b = req.body || {};
    const billId = v.id(req.params.id);
    const amount = v.amount(b.amount);
    const channel = v.oneOf(b.channel, tz.CHANNELS, 'channel');
    const ref = v.str(b.payment_ref, { min: 4, max: 40, field: 'payment_ref' }).toUpperCase();
    if (!/^[A-Z0-9.\-_/]+$/.test(ref)) throw v.bad('invalid_payment_ref');

    const { rows } = await query(
      `select b.amount_tzs, b.confirmed_tzs, b.partial_allowed from bills b
       join institutions i on i.id = b.institution_id where b.id = $1 and ${LIVE}`, [billId]);
    const bill = rows[0];
    if (!bill) throw v.bad('bill_not_open');
    const remaining = Number(bill.amount_tzs) - Number(bill.confirmed_tzs);
    if (amount > remaining) throw v.bad('amount_over_remaining');
    if (!bill.partial_allowed && amount !== remaining) throw v.bad('full_amount_required');

    // Only donor accounts earn points; an institution or admin testing the flow stays anonymous.
    const donorId = req.user && req.user.role === 'donor' ? req.user.id : null;
    // A giver without an account may leave an email for updates. Signed-in givers use their
    // account email. Either way the institution never sees it.
    const notifyEmail = !donorId && b.email ? v.email(b.email) : null;
    const code = v.trackingCode();
    let id;
    try {
      const r = await query(
        `insert into contributions (bill_id, donor_id, amount_tzs, payment_ref, channel, tracking_code, notify_email)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`, [billId, donorId, amount, ref, channel, code, notifyEmail]);
      id = r.rows[0].id;
    } catch (e) {
      if (e.code === '23505') throw new v.HttpError(409, 'duplicate_ref');
      throw e;
    }
    mail.paymentReported(id);
    res.status(201).json({ tracking_code: code, status: 'pending', emailed: !!(donorId || notifyEmail) });
  }));

router.get('/track/:code', v.h(async (req, res) => {
  const { rows } = await query(
    `select c.tracking_code, c.amount_tzs, c.status, c.created_at, c.reviewed_at,
            b.id as bill_id, b.category, b.status as bill_status, i.name as institution_name
     from contributions c join bills b on b.id = c.bill_id join institutions i on i.id = b.institution_id
     where c.tracking_code = $1`, [String(req.params.code || '').trim().toUpperCase()]);
  if (!rows[0]) throw new v.HttpError(404, 'not_found');
  res.json(rows[0]);
}));

// period: 'all' | 'month'
function periodClause(p) {
  return p === 'month' ? `and c.reviewed_at >= date_trunc('month', now())` : '';
}

router.get('/leaderboard/donors', v.h(async (req, res) => {
  const { rows } = await query(`
    select u.alias, u.donor_type, sum(c.amount_tzs)::bigint as total_tzs, count(*)::int as gifts,
           count(distinct c.bill_id)::int as bills,
           (sum(c.amount_tzs) / 1000)::bigint as points
    from contributions c join users u on u.id = c.donor_id
    where c.status = 'confirmed' and not u.hide_from_board ${periodClause(req.query.period)}
      ${['individual', 'organisation'].includes(req.query.dtype) ? `and u.donor_type = '${req.query.dtype}'` : ''}
    group by u.id, u.alias, u.donor_type order by total_tzs desc limit 50`);
  res.json(rows);
}));

router.get('/leaderboard/institutions', v.h(async (req, res) => {
  const args = [];
  let kind = '';
  if (['health', 'school'].includes(req.query.kind)) { args.push(req.query.kind); kind = 'and i.kind = $1'; }
  const { rows } = await query(`
    select i.id, i.name, i.kind, i.level, i.ownership, i.region,
           sum(c.amount_tzs)::bigint as total_tzs,
           count(distinct c.bill_id)::int as bills_helped,
           (select count(*) from bills x where x.institution_id = i.id and x.status = 'cleared')::int as bills_cleared
    from contributions c join bills b on b.id = c.bill_id join institutions i on i.id = b.institution_id
    where c.status = 'confirmed' and i.status = 'verified' ${kind} ${periodClause(req.query.period)}
    group by i.id order by total_tzs desc limit 50`, args);
  res.json(rows);
}));

router.get('/leaderboard/regions', v.h(async (req, res) => {
  const { rows } = await query(`
    select i.region, sum(c.amount_tzs)::bigint as total_tzs, count(distinct c.bill_id)::int as bills_helped,
           count(distinct i.id)::int as institutions
    from contributions c join bills b on b.id = c.bill_id join institutions i on i.id = b.institution_id
    where c.status = 'confirmed' ${periodClause(req.query.period)}
    group by i.region order by total_tzs desc`);
  res.json(rows);
}));

router.get('/institutions/:id', v.h(async (req, res) => {
  const iid = v.id(req.params.id);
  const { rows } = await query(
    `select i.id, i.name, i.kind, i.level, i.ownership, i.region, i.district, i.verified_at,
       (select coalesce(sum(c.amount_tzs),0) from contributions c join bills b on b.id = c.bill_id
         where b.institution_id = i.id and c.status = 'confirmed')::bigint as total_tzs,
       (select count(*) from bills b where b.institution_id = i.id and b.status = 'cleared')::int as bills_cleared
     from institutions i where i.id = $1 and i.status = 'verified'`, [iid]);
  if (!rows[0]) throw new v.HttpError(404, 'not_found');
  const bills = await query(
    `select ${PUBLIC_BILL} from bills b join institutions i on i.id = b.institution_id
     where i.id = $1 and ${LIVE} order by b.created_at desc limit 60`, [iid]);
  res.json({ ...rows[0], bills: bills.rows });
}));

module.exports = router;

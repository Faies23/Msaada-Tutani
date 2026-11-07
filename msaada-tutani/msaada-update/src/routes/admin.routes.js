const router = require('express').Router();
const { query } = require('../db');
const { requireRole } = require('../auth');
const v = require('../util');
const mail = require('../mail');

router.use(requireRole('admin'));

router.get('/institutions', v.h(async (req, res) => {
  const status = ['pending', 'verified', 'rejected', 'suspended'].includes(req.query.status) ? req.query.status : 'pending';
  const { rows } = await query(
    `select i.*, u.email,
       (select count(*) from bills b where b.institution_id = i.id)::int as bills
     from institutions i join users u on u.id = i.user_id
     where i.status = $1 order by i.created_at ${status === 'pending' ? 'asc' : 'desc'} limit 200`, [status]);
  const counts = await query(`select status, count(*)::int as n from institutions group by status`);
  res.json({ items: rows, counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])) });
}));

// action: verify | reject | suspend
router.post('/institutions/:id/:action', v.h(async (req, res) => {
  const map = { verify: 'verified', reject: 'rejected', suspend: 'suspended' };
  const status = map[req.params.action];
  if (!status) throw new v.HttpError(404, 'not_found');
  const note = v.str((req.body && req.body.note) || '', { max: 280, field: 'note' });
  const { rows } = await query(
    `update institutions set status = $2, review_note = $3,
       verified_at = case when $2 = 'verified' then now() else verified_at end
     where id = $1 returning id, status`, [v.id(req.params.id), status, note || null]);
  if (!rows[0]) throw new v.HttpError(404, 'not_found');
  mail.institutionReviewed(rows[0].id);
  res.json(rows[0]);
}));

// Everything the admin overview shows, in one round trip.
// Active donor: gave or signed in within 30 days. Dormant: neither within 90 days.
router.get('/overview', v.h(async (req, res) => {
  const [donors, inst, regions, bills, money, months, signups] = await Promise.all([
    query(`
      with d as (
        select u.id, u.donor_type, u.created_at, u.last_login_at,
               (select max(c.created_at) from contributions c where c.donor_id = u.id) as last_gift_at,
               exists (select 1 from contributions c where c.donor_id = u.id and c.status = 'confirmed') as gave
        from users u where u.role = 'donor')
      select count(*)::int as total,
             count(*) filter (where donor_type = 'individual')::int as individual,
             count(*) filter (where donor_type = 'organisation')::int as organisation,
             count(*) filter (where created_at > now() - interval '30 days')::int as new_30d,
             count(*) filter (where greatest(last_login_at, last_gift_at) > now() - interval '30 days')::int as active_30d,
             count(*) filter (where coalesce(greatest(last_login_at, last_gift_at), created_at) < now() - interval '90 days')::int as dormant_90d,
             count(*) filter (where not gave)::int as never_gave
      from d`),
    query(`select status, kind, count(*)::int as n from institutions group by status, kind`),
    query(`
      select i.region,
             count(*) filter (where i.status = 'verified')::int as verified,
             count(*) filter (where i.status = 'pending')::int as pending,
             coalesce((select sum(c.amount_tzs) from contributions c join bills b on b.id = c.bill_id
                       join institutions j on j.id = b.institution_id
                       where j.region = i.region and c.status = 'confirmed'), 0)::bigint as received_tzs
      from institutions i group by i.region order by verified desc, pending desc, i.region`),
    query(`
      select count(*) filter (where status = 'open')::int as open,
             count(*) filter (where status = 'cleared')::int as cleared,
             count(*) filter (where status = 'closed')::int as closed,
             coalesce(sum(amount_tzs - confirmed_tzs) filter (where status = 'open'), 0)::bigint as open_remaining_tzs,
             (select count(*) from contributions where status = 'pending')::int as payments_to_confirm
      from bills`),
    query(`
      select coalesce(sum(amount_tzs), 0)::bigint as total_tzs,
             coalesce(sum(amount_tzs) filter (where reviewed_at >= date_trunc('month', now())), 0)::bigint as this_month_tzs,
             count(*)::int as gifts
      from contributions where status = 'confirmed'`),
    query(`
      select to_char(m, 'YYYY-MM') as month,
             coalesce((select sum(amount_tzs) from contributions c
                       where c.status = 'confirmed' and date_trunc('month', c.reviewed_at) = m), 0)::bigint as tzs
      from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') m
      order by m`),
    query(`
      select to_char(w, 'YYYY-MM-DD') as week,
             (select count(*) from users u where u.role = 'donor' and date_trunc('week', u.created_at) = w)::int as donors,
             (select count(*) from institutions i where date_trunc('week', i.created_at) = w)::int as institutions
      from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') w
      order by w`)
  ]);
  const byStatus = { pending: 0, verified: 0, rejected: 0, suspended: 0 };
  const byKind = { health: 0, school: 0 };
  inst.rows.forEach((r) => { byStatus[r.status] = (byStatus[r.status] || 0) + r.n; if (r.status === 'verified') byKind[r.kind] += r.n; });
  res.json({
    donors: donors.rows[0], institutions: { by_status: byStatus, verified_by_kind: byKind, by_region: regions.rows },
    bills: bills.rows[0], money: Object.assign(money.rows[0], { by_month: months.rows }), signups: signups.rows
  });
}));

module.exports = router;

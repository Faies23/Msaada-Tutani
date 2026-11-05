const router = require('express').Router();
const { query } = require('../db');
const { requireRole } = require('../auth');
const v = require('../util');

router.use(requireRole('donor'));

router.get('/summary', v.h(async (req, res) => {
  const { rows } = await query(`
    select
      coalesce(sum(amount_tzs) filter (where status = 'confirmed'), 0)::bigint as total_tzs,
      count(*) filter (where status = 'confirmed')::int as gifts,
      count(*) filter (where status = 'pending')::int as pending,
      count(distinct bill_id) filter (where status = 'confirmed')::int as bills
    from contributions where donor_id = $1`, [req.user.id]);
  const s = rows[0];
  s.points = Math.floor(Number(s.total_tzs) / 1000);
  // Rank among visible donors by confirmed total (null while hidden or before the first gift).
  const r = await query(`
    with t as (
      select c.donor_id, sum(c.amount_tzs) as total from contributions c join users u on u.id = c.donor_id
      where c.status = 'confirmed' and not u.hide_from_board group by c.donor_id)
    select (select count(*) from t where total > me.total)::int + 1 as rank
    from t me where me.donor_id = $1`, [req.user.id]);
  s.rank = r.rows[0] ? r.rows[0].rank : null;
  res.json(s);
}));

router.get('/contributions', v.h(async (req, res) => {
  const { rows } = await query(
    `select c.tracking_code, c.amount_tzs, c.status, c.channel, c.created_at, c.reviewed_at,
            b.id as bill_id, b.category, b.status as bill_status,
            i.name as institution_name, i.region
     from contributions c join bills b on b.id = c.bill_id join institutions i on i.id = b.institution_id
     where c.donor_id = $1 order by c.created_at desc limit 200`, [req.user.id]);
  res.json(rows);
}));

router.patch('/profile', v.h(async (req, res) => {
  const b = req.body || {};
  const alias = v.str(b.alias, { min: 2, max: 32, field: 'alias' });
  await query('update users set alias = $2, hide_from_board = $3 where id = $1',
    [req.user.id, alias, !!b.hide_from_board]);
  res.json({ ok: true });
}));

module.exports = router;

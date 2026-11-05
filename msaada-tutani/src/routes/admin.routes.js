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

module.exports = router;

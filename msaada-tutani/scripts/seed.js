// Demo data so the site has something to show. Do not run against production.
require('dotenv').config();
const crypto = require('crypto');
const { pool } = require('../src/db');
const { hashPassword } = require('../src/auth');
const { trackingCode } = require('../src/util');

const INST = [
  ['Mwananyamala Regional Referral Hospital', 'health', 'HFR-105112', 'Dar es Salaam', 'Kinondoni', 'government', 'regional_referral'],
  ['Bugando Medical Centre', 'health', 'HFR-104882', 'Mwanza', 'Ilemela', 'faith', 'zonal_referral'],
  ['Mbweni Dispensary', 'health', 'HFR-110347', 'Dar es Salaam', 'Kinondoni', 'government', 'dispensary'],
  ['Makiungu Health Centre', 'health', 'HFR-108520', 'Singida', 'Ikungi', 'faith', 'health_centre'],
  ['Kibaha Secondary School', 'school', 'S.0123', 'Pwani', 'Kibaha', 'government', 'secondary'],
  ['Mlimani Primary School', 'school', 'EM.4471', 'Morogoro', 'Morogoro Urban', 'government', 'primary'],
  ['Arusha Technical Institute', 'school', 'REG/TEC/031', 'Arusha', 'Arusha City', 'private', 'college']
];
const BILLS = {
  health: [['maternity', 'Caesarean delivery; mother and newborn are well and ready to go home.'],
           ['surgery', 'Emergency appendectomy for a 9-year-old.'],
           ['inpatient', 'Twelve days on the medical ward after malaria complications.'],
           ['child_care', 'Neonatal unit care for premature twins.'],
           ['emergency', 'Road accident treatment, discharged and recovering.']],
  school: [['school_fees', 'Form Four student, final-year fees outstanding.'],
           ['exam_fees', 'National examination registration fees.'],
           ['certificate_release', 'Certificate held over arrears; student has a job offer.'],
           ['boarding', 'Boarding fees for an orphaned student, Term 2.']]
};
const ALIASES = ['Mwema', 'Rafiki wa Kweli', 'Nyota', 'Baraka', 'Mama Upendo', 'Simba Mpole', 'Tumaini', 'Neema'];

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (a) => a[rnd(0, a.length - 1)];
const cn = () => '99' + String(rnd(1e9, 9.99e9)).padStart(10, '0');

(async () => {
  const hash = await hashPassword('demo-password');
  const donors = [];
  for (const [i, alias] of ALIASES.entries()) {
    const r = await pool.query(
      `insert into users (role, email, password_hash, alias) values ('donor', $1, $2, $3)
       on conflict (email) do update set alias = excluded.alias returning id`, [`donor${i + 1}@demo.tz`, hash, alias]);
    donors.push(r.rows[0].id);
  }
  for (const [n, [name, kind, reg, region, district, own, level]] of INST.entries()) {
    const u = await pool.query(
      `insert into users (role, email, phone, password_hash) values ('institution', $1, '+255700000000', $2)
       on conflict (email) do update set email = excluded.email returning id`, [`inst${n + 1}@demo.tz`, hash]);
    const ins = await pool.query(
      `insert into institutions (user_id, name, kind, reg_no, region, district, ownership, level,
         contact_name, contact_title, phone, status, verified_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'Demo Contact','Accountant','+255700000000','verified', now())
       on conflict (user_id) do update set name = excluded.name returning id`,
      [u.rows[0].id, name, kind, reg, region, district, own, level]);
    const iid = ins.rows[0].id;
    for (let k = 0; k < rnd(2, 4); k++) {
      const [cat, note] = pick(BILLS[kind]);
      const amount = rnd(4, 180) * 5000;
      const exp = new Date(Date.now() + rnd(5, 60) * 864e5).toISOString().slice(0, 10);
      const b = await pool.query(
        `insert into bills (institution_id, control_number, amount_tzs, category, note, expires_on)
         values ($1,$2,$3,$4,$5,$6) returning id`, [iid, cn(), amount, cat, note, exp]);
      // Some confirmed gifts, some cleared bills, one pending per institution.
      let paid = 0;
      const target = Math.random() < 0.3 ? amount : Math.floor(amount * Math.random() * 0.8 / 1000) * 1000;
      while (paid < target) {
        const g = Math.min(target - paid, rnd(2, 40) * 2500);
        if (g < 500) break;
        await pool.query(
          `insert into contributions (bill_id, donor_id, amount_tzs, payment_ref, channel, status, tracking_code, reviewed_at)
           values ($1,$2,$3,$4,$5,'confirmed',$6, now() - ($7 || ' days')::interval)`,
          [b.rows[0].id, Math.random() < 0.25 ? null : pick(donors), g,
           crypto.randomBytes(5).toString('hex').toUpperCase(), pick(['mpesa', 'mixx', 'airtel']), trackingCode(), rnd(0, 40)]);
        paid += g;
      }
      await pool.query(
        `update bills set confirmed_tzs = $2, status = case when $2 >= amount_tzs then 'cleared' else 'open' end,
           cleared_at = case when $2 >= amount_tzs then now() end where id = $1`, [b.rows[0].id, paid]);
      if (paid < amount && k === 0) {
        await pool.query(
          `insert into contributions (bill_id, donor_id, amount_tzs, payment_ref, channel, tracking_code)
           values ($1, $2, $3, $4, 'mpesa', $5)`,
          [b.rows[0].id, pick(donors), Math.min(amount - paid, 10000), 'QK' + rnd(10000000, 99999999), trackingCode()]);
      }
    }
  }
  console.log('Demo data ready. Logins use password "demo-password": donor1@demo.tz, inst1@demo.tz');
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });

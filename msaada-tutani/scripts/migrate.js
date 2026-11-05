require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');
const { hashPassword } = require('../src/auth');
const { importCsv } = require('../src/catalogue');

(async () => {
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  console.log('Tables ready.');

  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const pw = process.env.ADMIN_PASSWORD || '';
  if (email && pw) {
    const r = await pool.query(
      `insert into users (role, email, password_hash, alias) values ('admin', $1, $2, 'Admin')
       on conflict (email) do nothing returning id`, [email, await hashPassword(pw)]);
    console.log(r.rows[0] ? 'Admin created: ' + email : 'Admin already exists: ' + email);
  } else {
    console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set; no admin created.');
  }
  const cat = await importCsv(pool, path.join(__dirname, '..', 'db', 'catalogue', 'starter.csv'), 'starter');
  console.log(`Catalogue starter list: ${cat.inserted} added.`);
  await pool.end();
})().catch((e) => { console.error('Migration failed:', e); process.exit(1); });

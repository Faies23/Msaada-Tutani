// Import an official list of institutions into the catalogue.
// Usage: npm run catalogue:import -- path/to/list.csv [source-label]
// Columns are matched by name; see README for accepted headers.
require('dotenv').config();
const { pool } = require('../src/db');
const { importCsv } = require('../src/catalogue');

(async () => {
  const file = process.argv[2];
  if (!file) { console.error('Usage: npm run catalogue:import -- list.csv [source]'); process.exit(1); }
  const r = await importCsv(pool, file, process.argv[3] || 'import');
  console.log(`Catalogue: ${r.inserted} added, ${r.skipped} skipped or updated.`);
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });

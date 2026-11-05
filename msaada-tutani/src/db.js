const fs = require('fs');
const { Pool, types } = require('pg');

// Return dates as 'YYYY-MM-DD' (no timezone drift) and bigint sums as numbers (TSh amounts
// stay far below 2^53).
types.setTypeParser(1082, (v) => v);
types.setTypeParser(20, (v) => Number(v));

const cs = process.env.DATABASE_URL || '';
const isLocal = !cs || cs.includes('localhost') || cs.includes('127.0.0.1');

// Managed Postgres needs TLS. Verify against a CA when one is provided; otherwise encrypt
// without verification (convenient, but pin a CA in production).
let ssl = false;
if (!isLocal) {
  const caPem = process.env.DATABASE_CA_CERT_PEM
    || (process.env.DATABASE_CA_CERT ? fs.readFileSync(process.env.DATABASE_CA_CERT, 'utf8') : '');
  ssl = caPem ? { rejectUnauthorized: true, ca: caPem } : { rejectUnauthorized: false };
}

const pool = new Pool({ connectionString: cs || undefined, ssl });
// Poolers drop idle connections; without a listener that error would crash the process.
pool.on('error', (err) => console.error('[db] idle client error:', err && err.message));

const query = (text, params) => pool.query(text, params);

// Run fn(client) inside a transaction.
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };

// Loads institution lists (CSV) into the catalogue table. Used by migrate (starter list) and by
// scripts/import-catalogue.js for the full official lists.
const fs = require('fs');
const { REGIONS, LEVELS, OWNERSHIP } = require('./tz');

// Minimal RFC 4180 CSV reader: quoted fields, doubled quotes, commas and newlines inside quotes.
function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

const norm = (s) => String(s || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');

// Accepts our own codes and the wording used in official exports.
const LEVEL_WORDS = {
  dispensary: 'dispensary', zahanati: 'dispensary', clinic: 'dispensary',
  'health centre': 'health_centre', 'health center': 'health_centre', 'kituo cha afya': 'health_centre',
  'district hospital': 'district_hospital', hospital: 'district_hospital', 'council designated hospital': 'district_hospital',
  'regional referral': 'regional_referral', 'regional referral hospital': 'regional_referral', 'regional hospital': 'regional_referral',
  'zonal referral': 'zonal_referral', 'zonal referral hospital': 'zonal_referral', 'zonal hospital': 'zonal_referral',
  'national hospital': 'national_hospital', national: 'national_hospital', 'national super specialized hospital': 'national_hospital',
  primary: 'primary', 'primary school': 'primary', msingi: 'primary',
  secondary: 'secondary', 'secondary school': 'secondary', sekondari: 'secondary',
  college: 'college', university: 'college', 'university college': 'college', institute: 'college'
};
const OWN_WORDS = {
  government: 'government', public: 'government', serikali: 'government', 'government owned': 'government',
  private: 'private', binafsi: 'private', 'private for profit': 'private',
  faith: 'faith', 'faith based': 'faith', 'faith based organization': 'faith', fbo: 'faith', 'religious': 'faith'
};

function toRecord(obj) {
  const name = String(obj.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 160) return null;
  let level = LEVELS.health.concat(LEVELS.school).includes(obj.level) ? obj.level : LEVEL_WORDS[norm(obj.level)];
  let kind = obj.kind === 'health' || obj.kind === 'school' ? obj.kind : null;
  if (!level) return null;
  if (!kind) kind = LEVELS.health.includes(level) ? 'health' : 'school';
  if (!LEVELS[kind].includes(level)) return null;
  const ownership = OWNERSHIP.includes(obj.ownership) ? obj.ownership : (OWN_WORDS[norm(obj.ownership)] || null);
  const region = REGIONS.find((r) => norm(r) === norm(obj.region)) || null;
  const district = String(obj.district || '').trim().slice(0, 80) || null;
  const reg = String(obj.reg_no || '').trim().slice(0, 40) || null;
  return { name, kind, level, ownership, region, district, reg_no: reg };
}

// Returns { inserted, skipped }.
async function importCsv(pool, file, source) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const head = rows.shift().map((h) => norm(h).replace(/ /g, '_'));
  const col = (names) => head.findIndex((h) => names.includes(h));
  const idx = {
    name: col(['name', 'facility_name', 'school_name', 'institution', 'institution_name', 'jina']),
    kind: col(['kind', 'type_of_institution']),
    level: col(['level', 'facility_type', 'school_level', 'category', 'type']),
    ownership: col(['ownership', 'owner', 'ownership_type', 'umiliki']),
    region: col(['region', 'mkoa']),
    district: col(['district', 'council', 'lga', 'wilaya', 'halmashauri']),
    reg_no: col(['reg_no', 'registration_number', 'facility_number', 'hfr_code', 'hfr_id', 'school_reg_no', 'centre_number', 'code'])
  };
  if (idx.name < 0 || idx.level < 0) throw new Error('CSV needs at least a name column and a level/type column');
  let inserted = 0, skipped = 0;
  for (const r of rows) {
    const get = (k) => (idx[k] >= 0 ? r[idx[k]] : '');
    const rec = toRecord({ name: get('name'), kind: get('kind'), level: get('level'), ownership: get('ownership'), region: get('region'), district: get('district'), reg_no: get('reg_no') });
    if (!rec) { skipped++; continue; }
    const res = await pool.query(
      `insert into catalogue (name, kind, level, ownership, region, district, reg_no, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (kind, lower(name), coalesce(region, '')) do update set
         level = excluded.level,
         ownership = coalesce(excluded.ownership, catalogue.ownership),
         district = coalesce(excluded.district, catalogue.district),
         reg_no = coalesce(excluded.reg_no, catalogue.reg_no)
       returning (xmax = 0) as fresh`,
      [rec.name, rec.kind, rec.level, rec.ownership, rec.region, rec.district, rec.reg_no, source]);
    if (res.rows[0] && res.rows[0].fresh) inserted++; else skipped++;
  }
  return { inserted, skipped };
}

module.exports = { parseCsv, toRecord, importCsv };

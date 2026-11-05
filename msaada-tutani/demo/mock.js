/* Demo backend: answers the site's /api calls in the browser with sample data, so the real
   front end can be shown without a server. Everything resets on reload. Mirrors src/routes. */
(function () {
  'use strict';
  const REGIONS = ['Arusha', 'Dar es Salaam', 'Dodoma', 'Geita', 'Iringa', 'Kagera', 'Katavi', 'Kigoma', 'Kilimanjaro', 'Lindi', 'Manyara', 'Mara', 'Mbeya', 'Morogoro', 'Mtwara', 'Mwanza', 'Njombe', 'Pwani', 'Rukwa', 'Ruvuma', 'Shinyanga', 'Simiyu', 'Singida', 'Songwe', 'Tabora', 'Tanga', 'Kaskazini Pemba', 'Kusini Pemba', 'Kaskazini Unguja', 'Kusini Unguja', 'Mjini Magharibi'];
  const META = {
    REGIONS,
    LEVELS: { health: ['dispensary', 'health_centre', 'district_hospital', 'regional_referral', 'zonal_referral', 'national_hospital'], school: ['primary', 'secondary', 'college'] },
    OWNERSHIP: ['government', 'private', 'faith'],
    CATEGORIES: { health: ['maternity', 'surgery', 'inpatient', 'child_care', 'emergency', 'dialysis', 'cancer_care', 'other_health'], school: ['school_fees', 'exam_fees', 'boarding', 'uniform_books', 'certificate_release', 'other_school'] },
    PAY_VIA: ['gepg', 'bank', 'lipa'],
    CHANNELS: ['mpesa', 'mixx', 'airtel', 'halopesa', 'azampesa', 'bank'],
    ORG_TYPES: ['company', 'ngo', 'religious', 'group', 'other']
  };
  // Starter catalogue, embedded by scripts/build-demo.js.
  const CATALOGUE = (window.MT_CATALOGUE || []).map((c, i) => Object.assign({ id: 100000 + i }, c));

  // Seeded random so the demo looks the same every time.
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = (a) => a[ri(0, a.length - 1)];
  const now = () => new Date().toISOString();
  const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString();
  const dateIn = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

  const db = { users: [], institutions: [], bills: [], contributions: [], id: 1 };
  const nid = () => db.id++;

  function code() {
    const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = '';
    for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)];
    return 'MT-' + s.slice(0, 4) + '-' + s.slice(4);
  }

  // ----- Seed -----
  const PW = 'demo1234';
  db.users.push({ id: nid(), role: 'admin', email: 'admin@demo.tz', password: PW, alias: 'Admin', hide_from_board: false, created_at: daysAgo(90) });
  const ALIASES = ['Mwema', 'Rafiki wa Kweli', 'Nyota', 'Baraka', 'Mama Upendo', 'Simba Mpole', 'Tumaini', 'Neema', 'Wafanyakazi wa Bandari', 'Jumuiya ya Kanisa la Mtakatifu Yosefu'];
  const donors = ALIASES.map((alias, i) => {
    const u = { id: nid(), role: 'donor', email: `donor${i + 1}@demo.tz`, password: PW, alias, hide_from_board: false, created_at: daysAgo(80), donor_type: 'individual' };
    db.users.push(u); return u.id;
  });
  db.users.filter((u) => u.alias === 'Wafanyakazi wa Bandari' || u.alias.startsWith('Jumuiya')).forEach((u) => { u.donor_type = 'organisation'; });
  const INST = [
    ['Mwananyamala Regional Referral Hospital', 'health', 'HFR-105112', 'Dar es Salaam', 'Kinondoni', 'government', 'regional_referral'],
    ['Bugando Medical Centre', 'health', 'HFR-104882', 'Mwanza', 'Ilemela', 'faith', 'zonal_referral'],
    ['Mbweni Dispensary', 'health', 'HFR-110347', 'Dar es Salaam', 'Kinondoni', 'government', 'dispensary'],
    ['Makiungu Health Centre', 'health', 'HFR-108520', 'Singida', 'Ikungi', 'faith', 'health_centre'],
    ['Kibaha Secondary School', 'school', 'S.0123', 'Pwani', 'Kibaha', 'government', 'secondary'],
    ['Mlimani Primary School', 'school', 'EM.4471', 'Morogoro', 'Morogoro Urban', 'government', 'primary'],
    ['Arusha Technical Institute', 'school', 'REG/TEC/031', 'Arusha', 'Arusha City', 'private', 'college'],
    ['Ilula Lutheran Hospital', 'health', 'HFR-106233', 'Iringa', 'Kilolo', 'faith', 'district_hospital']
  ];
  const NOTES = {
    health: [['maternity', 'Caesarean delivery; mother and newborn are well and ready to go home.'], ['surgery', 'Emergency appendectomy for a 9-year-old.'],
      ['inpatient', 'Twelve days on the medical ward after malaria complications.'], ['child_care', 'Neonatal unit care for premature twins.'],
      ['emergency', 'Road accident treatment, discharged and recovering.'], ['dialysis', 'Four dialysis sessions this month.']],
    school: [['school_fees', 'Form Four student, final-year fees outstanding.'], ['exam_fees', 'National examination registration fees.'],
      ['certificate_release', 'Certificate held over arrears; student has a job offer.'], ['boarding', 'Boarding fees for an orphaned student, Term 2.']]
  };
  INST.forEach(([name, kind, reg_no, region, district, ownership, level], n) => {
    const pending = n === INST.length - 1;
    const u = { id: nid(), role: 'institution', email: `inst${n + 1}@demo.tz`, password: PW, phone: '+255754000' + String(100 + n), created_at: daysAgo(70) };
    db.users.push(u);
    const inst = { id: nid(), user_id: u.id, name, kind, reg_no, region, district, ownership, level, contact_name: 'Demo Contact', contact_title: 'Accountant',
      phone: u.phone, status: pending ? 'pending' : 'verified', review_note: null, verified_at: pending ? null : daysAgo(60), created_at: pending ? daysAgo(1) : daysAgo(70) };
    db.institutions.push(inst);
    if (pending) return;
    const count = ri(2, 4);
    for (let k = 0; k < count; k++) {
      const [category, note] = pick(NOTES[kind]);
      const amount = ri(4, 140) * 5000;
      const b = { id: nid(), institution_id: inst.id, control_number: '99' + String(ri(1e9, 9.99e9)).padStart(10, '0'), pay_via: 'gepg', pay_via_detail: null,
        amount_tzs: amount, confirmed_tzs: 0, category, note, partial_allowed: true, expires_on: dateIn(ri(4, 60)), status: 'open', created_at: daysAgo(ri(1, 30)), cleared_at: null };
      db.bills.push(b);
      const target = rnd() < 0.3 ? amount : Math.floor(amount * rnd() * 0.8 / 1000) * 1000;
      while (b.confirmed_tzs < target) {
        const g = Math.min(target - b.confirmed_tzs, ri(2, 40) * 2500);
        if (g < 500) break;
        const when = rnd() < 0.4 ? new Date(Date.now() - ri(1, 23 * 60) * 6e4).toISOString() : daysAgo(ri(1, 40));
        db.contributions.push({ id: nid(), bill_id: b.id, donor_id: rnd() < 0.25 ? null : pick(donors), amount_tzs: g,
          payment_ref: Math.floor(rnd() * 1e10).toString(36).toUpperCase().padStart(8, 'Q'), channel: pick(['mpesa', 'mixx', 'airtel']),
          status: 'confirmed', tracking_code: code(), notify_email: null, created_at: when, reviewed_at: when });
        b.confirmed_tzs += g;
      }
      if (b.confirmed_tzs >= amount) { b.status = 'cleared'; b.cleared_at = daysAgo(1); }
      else if (k === 0) {
        db.contributions.push({ id: nid(), bill_id: b.id, donor_id: pick(donors), amount_tzs: Math.min(amount - b.confirmed_tzs, 10000),
          payment_ref: 'QK' + ri(10000000, 99999999), channel: 'mpesa', status: 'pending', tracking_code: code(), notify_email: null, created_at: daysAgo(0), reviewed_at: null });
      }
    }
  });

  // ----- Helpers mirroring the server -----
  class E extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
  const bad = (c) => new E(400, c);
  const instOf = (b) => db.institutions.find((i) => i.id === b.institution_id);
  const today = () => new Date().toISOString().slice(0, 10);
  const live = (b) => { const i = instOf(b); return i.status === 'verified' && b.status === 'open' && (!b.expires_on || b.expires_on >= today()); };
  const pub = (b) => { const i = instOf(b); return Object.assign({}, b, { institution_id: i.id, institution_name: i.name, kind: i.kind, level: i.level, ownership: i.ownership, region: i.region, district: i.district }); };
  const str = (v, min, max, f) => { const s = typeof v === 'string' ? v.trim() : ''; if (s.length < min || s.length > max) throw bad('invalid_' + f); return s; };
  const oneOf = (v, l, f) => { if (!l.includes(v)) throw bad('invalid_' + f); return v; };
  const email = (v) => { const s = str(v, 3, 160, 'email').toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw bad('invalid_email'); return s; };
  const phone = (v) => { const m = String(v || '').replace(/[\s-]/g, '').match(/^(?:\+?255|0)([67]\d{8})$/); if (!m) throw bad('invalid_phone'); return '+255' + m[1]; };
  const password = (v) => { if (typeof v !== 'string' || v.length < 8) throw bad('weak_password'); return v; };
  const amount = (v) => { const n = Number(v); if (!Number.isInteger(n) || n < 500 || n > 500000000) throw bad('invalid_amount'); return n; };
  const tokenFor = (u) => 'demo-' + u.id;
  const confirmed = (c) => c.status === 'confirmed';
  const inMonth = (c, period) => period !== 'month' || new Date(c.reviewed_at) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

  function me(headers) {
    const h = headers.Authorization || headers.authorization || '';
    const id = Number(String(h).replace('Bearer demo-', ''));
    return db.users.find((u) => u.id === id) || null;
  }
  function need(user, role) {
    if (!user) throw new E(401, 'auth_required');
    if (role && user.role !== role) throw new E(403, 'forbidden');
    return user;
  }

  // ----- Routes -----
  function handle(method, path, q, body, user) {
    let m;
    if (method === 'GET' && path === '/meta') return META;
    if (method === 'GET' && path === '/catalogue') {
      const qq = String(q.q || '').trim().toLowerCase();
      if (qq.length < 2) return [];
      return CATALOGUE.filter((c) => (!q.kind || c.kind === q.kind) && c.name.toLowerCase().includes(qq))
        .sort((a, b) => (b.name.toLowerCase().startsWith(qq) - a.name.toLowerCase().startsWith(qq)) || a.name.length - b.name.length)
        .slice(0, 8)
        .map((c) => Object.assign({}, c, { registered: db.institutions.some((i) => i.catalogue_id === c.id || i.name.toLowerCase() === c.name.toLowerCase()) }));
    }
    if (method === 'POST' && path === '/auth/forgot') return { ok: true };
    if (method === 'POST' && path === '/auth/reset') throw bad('reset_expired');
    if (method === 'GET' && path === '/stats') {
      return { total_tzs: sum(db.contributions.filter(confirmed), (c) => c.amount_tzs), bills_cleared: db.bills.filter((b) => b.status === 'cleared').length,
        bills_open: db.bills.filter(live).length, institutions: db.institutions.filter((i) => i.status === 'verified').length, gifts: db.contributions.filter(confirmed).length };
    }
    if (method === 'GET' && path === '/live') {
      const lastPaid = (b) => db.contributions.filter((c) => c.bill_id === b.id && confirmed(c)).sort((x, y) => y.reviewed_at.localeCompare(x.reviewed_at))[0];
      const dayAgo = new Date(Date.now() - 864e5).toISOString();
      const bills = db.bills.filter((b) => instOf(b).status === 'verified' && (live(b) || (b.status === 'cleared' && b.cleared_at > dayAgo))).map((b) => {
        const lp = lastPaid(b); const i = instOf(b);
        return { id: b.id, created_at: b.created_at, control_number: b.control_number, amount_tzs: b.amount_tzs, confirmed_tzs: b.confirmed_tzs, category: b.category,
          status: b.status, institution_name: i.name, region: i.region, kind: i.kind, level: i.level,
          last_paid_at: lp ? lp.reviewed_at : null, last_paid_tzs: lp ? lp.amount_tzs : null };
      }).sort((a, b) => (b.last_paid_at && b.last_paid_at > b.created_at ? b.last_paid_at : b.created_at).localeCompare(a.last_paid_at && a.last_paid_at > a.created_at ? a.last_paid_at : a.created_at)).slice(0, 40);
      const conf = db.contributions.filter(confirmed).sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at));
      const feed = conf.slice(0, 15).map((c) => { const b = db.bills.find((x) => x.id === c.bill_id);
        return { id: c.id, amount_tzs: c.amount_tzs, reviewed_at: c.reviewed_at, bill_id: b.id, control_number: b.control_number, institution_name: instOf(b).name }; });
      const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
      const todays = conf.filter((c) => new Date(c.reviewed_at) >= midnight);
      const hours = {};
      conf.filter((c) => c.reviewed_at > dayAgo).forEach((c) => { const t = Math.floor(new Date(c.reviewed_at).getTime() / 36e5) * 36e5; hours[t] = (hours[t] || 0) + c.amount_tzs; });
      return { bills, feed, cleared_today: sum(todays, (c) => c.amount_tzs), payments_today: todays.length, total_tzs: sum(conf, (c) => c.amount_tzs),
        series: Object.keys(hours).sort().map((t) => ({ t: +t, v: hours[t] })) };
    }
    if (method === 'GET' && path === '/bills') {
      let rows = db.bills.filter(live).map(pub);
      if (q.kind) rows = rows.filter((b) => b.kind === q.kind);
      if (q.region) rows = rows.filter((b) => b.region === q.region);
      if (q.ownership) rows = rows.filter((b) => b.ownership === q.ownership);
      if (q.level) rows = rows.filter((b) => b.level === q.level);
      if (q.q) { const s = q.q.toLowerCase(); rows = rows.filter((b) => (b.institution_name + ' ' + b.district + ' ' + b.control_number).toLowerCase().includes(s)); }
      const sorts = {
        newest: (a, b) => b.created_at.localeCompare(a.created_at),
        expiring: (a, b) => (a.expires_on || '9').localeCompare(b.expires_on || '9'),
        nearly: (a, b) => b.confirmed_tzs / b.amount_tzs - a.confirmed_tzs / a.amount_tzs,
        smallest: (a, b) => (a.amount_tzs - a.confirmed_tzs) - (b.amount_tzs - b.confirmed_tzs)
      };
      return rows.sort(sorts[q.sort] || sorts.newest).slice(0, Math.min(Number(q.limit) || 30, 60));
    }
    if (method === 'GET' && (m = path.match(/^\/bills\/(\d+)$/))) {
      const b = db.bills.find((x) => x.id === +m[1]);
      if (!b || instOf(b).status !== 'verified') throw new E(404, 'not_found');
      return Object.assign(pub(b), { gifts: db.contributions.filter((c) => c.bill_id === b.id && confirmed(c)).length });
    }
    if (method === 'POST' && (m = path.match(/^\/bills\/(\d+)\/contributions$/))) {
      const b = db.bills.find((x) => x.id === +m[1]);
      const a = amount(body.amount);
      const channel = oneOf(body.channel, META.CHANNELS, 'channel');
      const ref = str(body.payment_ref, 4, 40, 'payment_ref').toUpperCase();
      if (!/^[A-Z0-9.\-_/]+$/.test(ref)) throw bad('invalid_payment_ref');
      if (!b || !live(b)) throw bad('bill_not_open');
      const rem = b.amount_tzs - b.confirmed_tzs;
      if (a > rem) throw bad('amount_over_remaining');
      if (!b.partial_allowed && a !== rem) throw bad('full_amount_required');
      if (db.contributions.some((c) => c.bill_id === b.id && c.payment_ref === ref)) throw new E(409, 'duplicate_ref');
      const donorId = user && user.role === 'donor' ? user.id : null;
      const notify = !donorId && body.email ? email(body.email) : null;
      const c = { id: nid(), bill_id: b.id, donor_id: donorId, amount_tzs: a, payment_ref: ref, channel, status: 'pending', tracking_code: code(), notify_email: notify, created_at: now(), reviewed_at: null };
      db.contributions.push(c);
      return { tracking_code: c.tracking_code, status: 'pending', emailed: !!(donorId || notify) };
    }
    if (method === 'GET' && (m = path.match(/^\/track\/(.+)$/))) {
      const c = db.contributions.find((x) => x.tracking_code === decodeURIComponent(m[1]).trim().toUpperCase());
      if (!c) throw new E(404, 'not_found');
      const b = db.bills.find((x) => x.id === c.bill_id);
      return { tracking_code: c.tracking_code, amount_tzs: c.amount_tzs, status: c.status, created_at: c.created_at, reviewed_at: c.reviewed_at,
        bill_id: b.id, category: b.category, bill_status: b.status, institution_name: instOf(b).name };
    }
    if (method === 'GET' && path === '/leaderboard/donors') {
      const by = {};
      db.contributions.filter((c) => confirmed(c) && c.donor_id && inMonth(c, q.period)).forEach((c) => {
        const u = db.users.find((x) => x.id === c.donor_id);
        if (u.hide_from_board || (q.dtype && u.donor_type !== q.dtype)) return;
        const r = by[u.id] || (by[u.id] = { alias: u.alias, donor_type: u.donor_type, total_tzs: 0, gifts: 0, bills: new Set() });
        r.total_tzs += c.amount_tzs; r.gifts++; r.bills.add(c.bill_id);
      });
      return Object.values(by).map((r) => ({ alias: r.alias, donor_type: r.donor_type, total_tzs: r.total_tzs, gifts: r.gifts, bills: r.bills.size, points: Math.floor(r.total_tzs / 1000) }))
        .sort((a, b) => b.total_tzs - a.total_tzs);
    }
    if (method === 'GET' && path === '/leaderboard/institutions') {
      const by = {};
      db.contributions.filter((c) => confirmed(c) && inMonth(c, q.period)).forEach((c) => {
        const b = db.bills.find((x) => x.id === c.bill_id); const i = instOf(b);
        if (i.status !== 'verified' || (q.kind && i.kind !== q.kind)) return;
        const r = by[i.id] || (by[i.id] = { id: i.id, name: i.name, kind: i.kind, level: i.level, ownership: i.ownership, region: i.region, total_tzs: 0, bills: new Set(),
          bills_cleared: db.bills.filter((x) => x.institution_id === i.id && x.status === 'cleared').length });
        r.total_tzs += c.amount_tzs; r.bills.add(b.id);
      });
      return Object.values(by).map((r) => Object.assign(r, { bills_helped: r.bills.size, bills: undefined })).sort((a, b) => b.total_tzs - a.total_tzs);
    }
    if (method === 'GET' && path === '/leaderboard/regions') {
      const by = {};
      db.contributions.filter((c) => confirmed(c) && inMonth(c, q.period)).forEach((c) => {
        const b = db.bills.find((x) => x.id === c.bill_id); const i = instOf(b);
        const r = by[i.region] || (by[i.region] = { region: i.region, total_tzs: 0, bills: new Set(), insts: new Set() });
        r.total_tzs += c.amount_tzs; r.bills.add(b.id); r.insts.add(i.id);
      });
      return Object.values(by).map((r) => ({ region: r.region, total_tzs: r.total_tzs, bills_helped: r.bills.size, institutions: r.insts.size })).sort((a, b) => b.total_tzs - a.total_tzs);
    }
    if (method === 'GET' && (m = path.match(/^\/institutions\/(\d+)$/))) {
      const i = db.institutions.find((x) => x.id === +m[1] && x.status === 'verified');
      if (!i) throw new E(404, 'not_found');
      const ids = db.bills.filter((b) => b.institution_id === i.id).map((b) => b.id);
      return { id: i.id, name: i.name, kind: i.kind, level: i.level, ownership: i.ownership, region: i.region, district: i.district, verified_at: i.verified_at,
        total_tzs: sum(db.contributions.filter((c) => confirmed(c) && ids.includes(c.bill_id)), (c) => c.amount_tzs),
        bills_cleared: db.bills.filter((b) => b.institution_id === i.id && b.status === 'cleared').length,
        bills: db.bills.filter((b) => b.institution_id === i.id && live(b)).map(pub) };
    }

    // Auth
    if (method === 'POST' && path === '/auth/login') {
      const u = db.users.find((x) => x.email === String(body.email || '').trim().toLowerCase());
      if (!u || u.password !== body.password) throw new E(401, 'bad_login');
      return { token: tokenFor(u), role: u.role };
    }
    if (method === 'POST' && path === '/auth/donor/signup') {
      const type = oneOf(body.donor_type || 'individual', ['individual', 'organisation'], 'donor_type');
      const e = email(body.email); password(body.password);
      if (body.phone) phone(body.phone);
      let alias, extra = {};
      if (type === 'organisation') {
        const org = str(body.org_name, 2, 120, 'org_name');
        oneOf(body.org_type, META.ORG_TYPES, 'org_type');
        str(body.contact_name, 3, 80, 'contact_name');
        alias = str(body.alias || org, 2, 60, 'alias');
        extra = { org_name: org, org_type: body.org_type, full_name: body.contact_name };
      } else {
        alias = str(body.alias, 2, 32, 'alias');
        extra = { full_name: body.full_name || null };
      }
      if (db.users.some((u) => u.email === e)) throw new E(409, 'email_taken');
      const u = Object.assign({ id: nid(), role: 'donor', email: e, password: body.password, alias, hide_from_board: !!body.hide_from_board, created_at: now(), donor_type: type }, extra);
      db.users.push(u); return { token: tokenFor(u), role: 'donor' };
    }
    if (method === 'POST' && path === '/auth/institution/signup') {
      const kind = oneOf(body.kind, ['health', 'school'], 'kind');
      const d = { name: str(body.name, 3, 120, 'name'), reg_no: str(body.reg_no, 2, 40, 'reg_no').toUpperCase(), region: oneOf(body.region, REGIONS, 'region'),
        district: str(body.district, 2, 60, 'district'), ownership: oneOf(body.ownership, META.OWNERSHIP, 'ownership'), level: oneOf(body.level, META.LEVELS[kind], 'level'),
        contact_name: str(body.contact_name, 3, 80, 'contact_name'), contact_title: (body.contact_title || '').trim() || null, phone: phone(body.phone) };
      const e = email(body.email); password(body.password);
      if (db.users.some((u) => u.email === e)) throw new E(409, 'email_taken');
      if (db.institutions.some((i) => i.kind === kind && i.reg_no === d.reg_no)) throw new E(409, 'reg_no_taken');
      if (body.catalogue_id) {
        const c = CATALOGUE.find((x) => x.id === Number(body.catalogue_id));
        if (!c || c.kind !== kind) throw bad('invalid_catalogue');
        if (db.institutions.some((i) => i.catalogue_id === c.id)) throw new E(409, 'already_registered');
        d.catalogue_id = c.id;
      }
      const u = { id: nid(), role: 'institution', email: e, password: body.password, phone: d.phone, created_at: now() };
      db.users.push(u);
      db.institutions.push(Object.assign({ id: nid(), user_id: u.id, kind, status: 'pending', review_note: null, verified_at: null, created_at: now() }, d));
      return { token: tokenFor(u), role: 'institution' };
    }
    if (method === 'GET' && path === '/auth/me') {
      const u = need(user);
      const out = { id: u.id, role: u.role, email: u.email, alias: u.alias, hide_from_board: u.hide_from_board, created_at: u.created_at, donor_type: u.donor_type, org_name: u.org_name };
      if (u.role === 'institution') out.institution = db.institutions.find((i) => i.user_id === u.id);
      return out;
    }

    // Donor
    if (path.startsWith('/me/')) {
      const u = need(user, 'donor');
      const mine = db.contributions.filter((c) => c.donor_id === u.id);
      if (method === 'GET' && path === '/me/summary') {
        const conf = mine.filter(confirmed);
        const total = sum(conf, (c) => c.amount_tzs);
        const totals = {};
        db.contributions.filter((c) => confirmed(c) && c.donor_id).forEach((c) => {
          const d = db.users.find((x) => x.id === c.donor_id);
          if (!d.hide_from_board) totals[d.id] = (totals[d.id] || 0) + c.amount_tzs;
        });
        const rank = totals[u.id] ? Object.values(totals).filter((v) => v > totals[u.id]).length + 1 : null;
        return { total_tzs: total, gifts: conf.length, pending: mine.filter((c) => c.status === 'pending').length, bills: new Set(conf.map((c) => c.bill_id)).size, points: Math.floor(total / 1000), rank };
      }
      if (method === 'GET' && path === '/me/contributions') {
        return mine.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).map((c) => {
          const b = db.bills.find((x) => x.id === c.bill_id); const i = instOf(b);
          return { tracking_code: c.tracking_code, amount_tzs: c.amount_tzs, status: c.status, channel: c.channel, created_at: c.created_at, reviewed_at: c.reviewed_at,
            bill_id: b.id, category: b.category, bill_status: b.status, institution_name: i.name, region: i.region };
        });
      }
      if (method === 'PATCH' && path === '/me/profile') {
        u.alias = str(body.alias, 2, 32, 'alias'); u.hide_from_board = !!body.hide_from_board; return { ok: true };
      }
    }

    // Institution
    if (path.startsWith('/inst/')) {
      const u = need(user, 'institution');
      const inst = db.institutions.find((i) => i.user_id === u.id);
      const mineB = db.bills.filter((b) => b.institution_id === inst.id);
      const ids = mineB.map((b) => b.id);
      const mineC = db.contributions.filter((c) => ids.includes(c.bill_id));
      if (method === 'GET' && path === '/inst/overview') {
        return { institution: inst, open_bills: mineB.filter((b) => b.status === 'open').length, cleared_bills: mineB.filter((b) => b.status === 'cleared').length,
          received_tzs: sum(mineC.filter(confirmed), (c) => c.amount_tzs), pending: mineC.filter((c) => c.status === 'pending').length };
      }
      if (method === 'GET' && path === '/inst/bills') {
        return mineB.slice().sort((a, b) => (b.status === 'open') - (a.status === 'open') || b.created_at.localeCompare(a.created_at))
          .map((b) => Object.assign({}, b, { pending: mineC.filter((c) => c.bill_id === b.id && c.status === 'pending').length }));
      }
      if (method === 'POST' && path === '/inst/bills') {
        if (inst.status !== 'verified') throw new E(403, 'not_verified');
        const cn = String(body.control_number || '').replace(/\s/g, '');
        if (!/^[A-Za-z0-9-]{6,30}$/.test(cn)) throw bad('invalid_control_number');
        const payVia = oneOf(body.pay_via || 'gepg', META.PAY_VIA, 'pay_via');
        const detail = (body.pay_via_detail || '').trim();
        if (payVia !== 'gepg' && !detail) throw bad('invalid_pay_via_detail');
        const a = amount(body.amount);
        const category = oneOf(body.category, META.CATEGORIES[inst.kind], 'category');
        if (body.expires_on && body.expires_on < today()) throw bad('invalid_expires_on');
        if (mineB.some((b) => b.status === 'open' && b.control_number === cn.toUpperCase())) throw new E(409, 'control_number_live');
        const b = { id: nid(), institution_id: inst.id, control_number: cn.toUpperCase(), pay_via: payVia, pay_via_detail: detail || null, amount_tzs: a, confirmed_tzs: 0,
          category, note: (body.note || '').trim() || null, partial_allowed: body.partial_allowed !== false, expires_on: body.expires_on || null, status: 'open', created_at: now(), cleared_at: null };
        db.bills.push(b); return b;
      }
      if (method === 'POST' && (m = path.match(/^\/inst\/bills\/(\d+)\/close$/))) {
        const b = mineB.find((x) => x.id === +m[1] && x.status === 'open');
        if (!b) throw new E(404, 'not_found');
        b.status = 'closed'; return { ok: true };
      }
      if (method === 'GET' && path === '/inst/contributions') {
        const st = ['pending', 'confirmed', 'rejected'].includes(q.status) ? q.status : 'pending';
        return mineC.filter((c) => c.status === st).sort((a, b) => st === 'pending' ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at))
          .map((c) => { const b = db.bills.find((x) => x.id === c.bill_id);
            return { id: c.id, amount_tzs: c.amount_tzs, payment_ref: c.payment_ref, channel: c.channel, status: c.status, created_at: c.created_at, reviewed_at: c.reviewed_at,
              bill_id: b.id, control_number: b.control_number, category: b.category, bill_amount: b.amount_tzs, confirmed_tzs: b.confirmed_tzs }; });
      }
      if (method === 'POST' && (m = path.match(/^\/inst\/contributions\/(\d+)\/(confirm|reject)$/))) {
        const c = mineC.find((x) => x.id === +m[1] && x.status === 'pending');
        if (!c) throw new E(404, 'not_found');
        c.reviewed_at = now();
        if (m[2] === 'reject') { c.status = 'rejected'; return { ok: true }; }
        const got = body.amount != null ? amount(body.amount) : c.amount_tzs;
        c.status = 'confirmed'; c.amount_tzs = got;
        const b = db.bills.find((x) => x.id === c.bill_id);
        b.confirmed_tzs += got;
        if (b.status === 'open' && b.confirmed_tzs >= b.amount_tzs) { b.status = 'cleared'; b.cleared_at = now(); }
        return { ok: true, bill: { id: b.id, status: b.status, amount_tzs: b.amount_tzs, confirmed_tzs: b.confirmed_tzs } };
      }
    }

    // Admin
    if (path.startsWith('/admin/')) {
      need(user, 'admin');
      if (method === 'GET' && path === '/admin/institutions') {
        const st = ['pending', 'verified', 'rejected', 'suspended'].includes(q.status) ? q.status : 'pending';
        const counts = {};
        db.institutions.forEach((i) => { counts[i.status] = (counts[i.status] || 0) + 1; });
        return { counts, items: db.institutions.filter((i) => i.status === st).map((i) => Object.assign({}, i, {
          email: db.users.find((u) => u.id === i.user_id).email, bills: db.bills.filter((b) => b.institution_id === i.id).length })) };
      }
      if (method === 'POST' && (m = path.match(/^\/admin\/institutions\/(\d+)\/(verify|reject|suspend)$/))) {
        const i = db.institutions.find((x) => x.id === +m[1]);
        if (!i) throw new E(404, 'not_found');
        i.status = { verify: 'verified', reject: 'rejected', suspend: 'suspended' }[m[2]];
        i.review_note = (body.note || '').trim() || null;
        if (i.status === 'verified') i.verified_at = now();
        return { id: i.id, status: i.status };
      }
    }
    throw new E(404, 'not_found');
  }

  // Simulated activity: a confirmed payment every few seconds, and now and then a new bill.
  // Uses Math.random (not the seeded generator) so each visit plays out differently.
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const P = (a) => a[Math.floor(Math.random() * a.length)];
  setInterval(() => {
    const open = db.bills.filter(live);
    if (Math.random() < 0.13 || open.length < 8) {
      const inst = P(db.institutions.filter((i) => i.status === 'verified'));
      const [category, note] = P(NOTES[inst.kind]);
      db.bills.push({ id: nid(), institution_id: inst.id, control_number: '99' + String(R(1e9, 9.99e9)).padStart(10, '0'), pay_via: 'gepg', pay_via_detail: null,
        amount_tzs: R(4, 120) * 5000, confirmed_tzs: 0, category, note, partial_allowed: true, expires_on: dateIn(R(5, 45)), status: 'open', created_at: now(), cleared_at: null });
      return;
    }
    const b = P(open);
    const g = Math.min(b.amount_tzs - b.confirmed_tzs, P([2000, 5000, 5000, 10000, 10000, 15000, 20000, 25000, 50000]));
    db.contributions.push({ id: nid(), bill_id: b.id, donor_id: Math.random() < 0.3 ? null : P(donors), amount_tzs: g,
      payment_ref: 'QK' + R(10000000, 99999999), channel: P(['mpesa', 'mixx', 'airtel', 'halopesa']), status: 'confirmed',
      tracking_code: code(), notify_email: null, created_at: now(), reviewed_at: now() });
    b.confirmed_tzs += g;
    if (b.confirmed_tzs >= b.amount_tzs) { b.status = 'cleared'; b.cleared_at = now(); }
  }, 3200);

  const realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (url, opts) {
    const u = String(url);
    if (!u.startsWith('/api')) return realFetch(url, opts);
    opts = opts || {};
    const [path, qs] = u.slice(4).split('?');
    const q = Object.fromEntries(new URLSearchParams(qs || ''));
    let body = {};
    try { body = opts.body ? JSON.parse(opts.body) : {}; } catch (e) {}
    let status = 200, data;
    try {
      data = handle((opts.method || 'GET').toUpperCase(), path, q, body, me(opts.headers || {}));
      if ((opts.method || 'GET').toUpperCase() === 'POST' && /signup|contributions$|\/inst\/bills$/.test(path)) status = 201;
    } catch (e) {
      if (!(e instanceof E)) { console.error(e); e = new E(500, 'server_error'); }
      status = e.status; data = { error: e.code };
    }
    const payload = JSON.parse(JSON.stringify(data));
    return new Promise((res) => setTimeout(() => res({ ok: status < 400, status, json: () => Promise.resolve(payload) }), 120));
  };
})();

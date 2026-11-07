/* Msaada Tutani: single-page front end. No build step, no framework. */
(function () {
  'use strict';

  // ---------- Storage (never trusted to exist) ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  };

  const S = {
    lang: store.get('tk_lang') || ((navigator.language || '').toLowerCase().startsWith('sw') ? 'sw' : 'en'),
    token: store.get('tk_token'),
    me: null,
    meta: null
  };

  // ---------- i18n ----------
  function t(key, vars) {
    const d = window.I18N[S.lang] || window.I18N.en;
    let s = d[key] != null ? d[key] : (window.I18N.en[key] != null ? window.I18N.en[key] : key);
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }

  // ---------- Safe HTML templating: every interpolation is escaped unless wrapped in raw() ----------
  function Raw(s) { this.s = s; }
  const raw = (s) => new Raw(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function val(v) {
    if (v instanceof Raw) return v.s;
    if (Array.isArray(v)) return v.map(val).join('');
    if (v == null || v === false) return '';
    return esc(v);
  }
  function html(strings, ...vals) {
    let out = '';
    strings.forEach((s, i) => { out += s + (i < vals.length ? val(vals[i]) : ''); });
    return raw(out);
  }

  // ---------- Formatting ----------
  const tzs = (n) => 'TSh ' + Math.round(Number(n) || 0).toLocaleString('en-US');
  const num = (n) => (Number(n) || 0).toLocaleString('en-US');
  const locale = () => (S.lang === 'sw' ? 'sw-TZ' : 'en-GB');
  function fdate(d) {
    if (!d) return '';
    const x = typeof d === 'string' && d.length === 10 ? new Date(d + 'T00:00:00') : new Date(d);
    try { return x.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch (e) { return x.toDateString(); }
  }
  const pct = (b) => Math.min(100, Math.round((Number(b.confirmed_tzs) / Number(b.amount_tzs)) * 100) || 0);
  const left = (b) => Math.max(0, Number(b.amount_tzs) - Number(b.confirmed_tzs));
  const lvl = (l) => t('lvl_' + l);
  const cat = (c) => t('cat_' + c);
  const own = (o) => t('own_' + o);
  const fmtCn = (cn) => String(cn).replace(/(.{4})(?=.)/g, '$1 ');

  // ---------- API ----------
  async function api(path, opts) {
    opts = opts || {};
    const headers = { 'Accept': 'application/json' };
    if (opts.body) headers['Content-Type'] = 'application/json';
    if (S.token) headers['Authorization'] = 'Bearer ' + S.token;
    let res;
    try {
      res = await fetch('/api' + path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    } catch (e) { const er = new Error('network'); er.code = 'network'; throw er; }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && S.token && path !== '/auth/login') { setToken(null); }
    if (!res.ok) { const er = new Error(data.error || 'generic'); er.code = data.error || 'generic'; er.status = res.status; throw er; }
    return data;
  }
  const errMsg = (e) => {
    const k = 'e_' + (e && e.code);
    const s = t(k);
    return s === k ? t('e_generic') : s;
  };

  function setToken(tok) {
    S.token = tok; S.me = null;
    store.set('tk_token', tok);
  }
  async function loadMe() {
    if (!S.token) { S.me = null; return null; }
    try { S.me = await api('/auth/me'); } catch (e) { S.me = null; }
    return S.me;
  }
  async function meta() {
    if (!S.meta) S.meta = await api('/meta');
    return S.meta;
  }

  // ---------- DOM helpers ----------
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const main = $('#main');

  function paint(el, h) {
    el.innerHTML = val(h);
    // Widths are set through the CSSOM so the strict CSP needs no inline styles.
    requestAnimationFrame(() => $$('[data-pct]', el).forEach((b) => { b.style.width = b.getAttribute('data-pct') + '%'; }));
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (x) {}
      ta.remove();
    }
    toast(t('copied'));
  }

  function formData(form) {
    const o = {};
    new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
    return o;
  }
  function busy(form, on) {
    const b = $('button[type=submit]', form);
    if (b) b.disabled = on;
  }
  function showErr(form, e) {
    const el = $('.err', form);
    if (el) el.textContent = typeof e === 'string' ? e : errMsg(e);
  }

  const opt = (value, label, sel) => html`<option value="${value}" ${sel ? raw('selected') : ''}>${label}</option>`;
  const icon = {
    arrow: raw('<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M13.2 5.3 19.9 12l-6.7 6.7-1.4-1.4 4.3-4.3H4v-2h12.1l-4.3-4.3z"/></svg>'),
    back: raw('<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M10.8 5.3 4.1 12l6.7 6.7 1.4-1.4L7.9 13H20v-2H7.9l4.3-4.3z"/></svg>'),
    check: raw('<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="m9.5 16.2-4.2-4.2-1.4 1.4 5.6 5.6 11-11-1.4-1.4z"/></svg>'),
    copy: raw('<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11z"/></svg>'),
    heart: raw('<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2 0 3.5 1.1 4.4 2.5.9-1.4 2.4-2.5 4.4-2.5 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z"/></svg>'),
    build: raw('<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2 2 7v2h20V7zm-8 9v7h3v-7zm6.5 0v7h3v-7zM17 11v7h3v-7zM2 20v2h20v-2z"/></svg>'),
    out: raw('<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5zm6.6 4.4-1.4 1.4 2.2 2.2H9v2h8.4l-2.2 2.2 1.4 1.4L21.2 12z"/></svg>')
  };

  const logo = raw('<svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#FFC53D"/><path d="M5 33H13C17 33 18 21 24 21C30 21 31 33 35 33H43" fill="none" stroke="#0A0F1C" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="12.5" r="3.6" fill="#0A0F1C"/></svg>');

  // ---------- Shell (nav, account, footer) ----------
  function dashLink() {
    if (!S.me) return null;
    if (S.me.role === 'institution') return '#/inst';
    if (S.me.role === 'admin') return '#/admin';
    return '#/me';
  }
  function shell(path) {
    document.documentElement.lang = S.lang;
    $('#lang').textContent = S.lang === 'sw' ? 'EN' : 'SW';
    const items = [['#/live', 'nav_live'], ['#/bills', 'nav_bills'], ['#/board', 'nav_board'], ['#/track', 'nav_track']];
    paint($('#nav'), html`${items.map(([h, k]) => html`<a href="${h}" ${('#' + path).startsWith(h) ? raw('aria-current="page"') : ''}>${h === '#/live' ? raw('<span class="live-dot"></span>') : ''}${t(k)}</a>`)}
      ${S.me ? html`<a class="m-only" href="#/" data-act="logout">${t('sign_out')}</a>` : html`<a class="m-only" href="#/login">${t('sign_in')}</a>`}`);
    const acct = $('#account');
    if (S.me) {
      const label = S.me.role === 'donor' ? t('my_giving') : S.me.role === 'admin' ? t('admin') : t('dashboard');
      paint(acct, html`<span class="row">
        <a class="btn sm keep" href="${dashLink()}">${label}</a>
        <button class="icon-btn" type="button" data-act="logout" aria-label="${t('sign_out')}" title="${t('sign_out')}">${icon.out}</button></span>`);
    } else {
      paint(acct, html`<span class="row"><a class="btn sm ghost" href="#/login">${t('sign_in')}</a><a class="btn sm primary keep" href="#/join">${t('join')}</a></span>`);
    }
    paint($('#foot'), html`
      <div class="row">${logo}<div><div class="brand-word">Msaada <b>Tutani</b></div><div class="motto-foot">${t('motto')}</div><div class="small sp-sm">${t('foot_note')}</div></div></div>
      <div class="row"><a href="#/about">${t('nav_how')}</a><a href="#/board">${t('nav_board')}</a><a href="#/join/institution">${t('for_institutions')}</a><a href="#/track">${t('nav_track')}</a><a href="#/privacy">${t('privacy')}</a></div>`);
    $('#tape').hidden = true;
    $('#nav').classList.remove('open');
    $('#menu').setAttribute('aria-expanded', 'false');
  }

  // ---------- Reusable pieces ----------
  function billCard(b) {
    const daysLeft = b.expires_on ? Math.ceil((new Date(b.expires_on + 'T23:59:59') - Date.now()) / 864e5) : null;
    return html`
      <a class="bill fade" href="#/bill/${b.id}">
        <div class="bill-top">
          <div><div class="bill-inst">${b.institution_name}</div><div class="bill-loc">${b.district}, ${b.region}</div></div>
          <span class="tag">${lvl(b.level)}</span>
        </div>
        <div><div class="cat">${cat(b.category)}</div></div>
        <p class="bill-note">${b.note || ''}</p>
        <div>
          <div class="bill-amt"><span class="big">${tzs(left(b))}</span><span class="muted small">${t('remaining')}</span></div>
          <div class="bar sp-sm"><i data-pct="${pct(b)}"></i></div>
        </div>
        <div class="bill-meta"><span>${pct(b)}% · ${t('of')} ${tzs(b.amount_tzs)}</span>
          <span>${daysLeft != null ? (daysLeft <= 7 ? html`<span class="tag warn">${daysLeft}d</span>` : fdate(b.expires_on)) : t('no_expiry')}</span></div>
      </a>`;
  }
  const skeletons = (n) => html`<div class="bills">${Array.from({ length: n }, () => raw('<div class="skel"></div>'))}</div>`;
  const statusTag = (s) => {
    const cls = { pending: 'warn', confirmed: 'accent', rejected: 'danger', open: 'accent', cleared: '', closed: '' }[s] || '';
    const label = { pending: t('st_pending'), confirmed: t('st_confirmed'), rejected: t('st_rejected'), open: t('st_open'), cleared: t('cleared'), closed: t('closed') }[s] || s;
    return html`<span class="tag ${cls}"><span class="dot"></span>${label}</span>`;
  };

  // ---------- Live board ----------
  // Polls /api/live and redraws. A row whose paid amount went up flashes green and shows the
  // change; a bill we haven't seen before flashes yellow. Polling stops on every navigation.
  const LIVE = { timer: null, prev: null, feedSeen: null, tape: false };
  function stopLive() { clearInterval(LIVE.timer); LIVE.timer = null; LIVE.prev = null; LIVE.feedSeen = null; LIVE.tape = false; }
  function ago(ts) {
    if (!ts) return '';
    const s = Math.max(0, (Date.now() - new Date(ts)) / 1000);
    if (s < 60) return t('just_now');
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    return fdate(ts);
  }
  const short = (d) => { try { return new Date(d).toLocaleDateString(locale(), { day: '2-digit', month: 'short' }); } catch (e) { return fdate(d); } };
  const clock = (d) => { try { return new Date(d).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

  function boardRows(bills, limit) {
    const prev = LIVE.prev;
    const rows = bills.slice(0, limit).map((b) => {
      let cls = '';
      if (prev) {
        if (!prev.has(b.id)) cls = 'new';
        else if (Number(b.confirmed_tzs) > prev.get(b.id)) cls = 'tick';
      }
      const change = b.status === 'cleared' ? html`<span class="tag accent">${t('cleared')}</span>`
        : b.last_paid_tzs ? html`<span class="chg">+${num(b.last_paid_tzs)}</span> <span class="muted small">${ago(b.last_paid_at)}</span>`
        : html`<span class="tag warn">${t('new_bill')}</span>`;
      return html`<tr class="${cls}" data-href="#/bill/${b.id}">
        <td class="hide-sm">${short(b.created_at)} <span class="muted small">${clock(b.created_at)}</span></td>
        <td class="inst">${b.institution_name}<small>${b.region} · ${cat(b.category)}</small>
          <small class="sm-only">${short(b.created_at)} · ${fmtCn(b.control_number)}</small></td>
        <td class="cnum hide-sm">${fmtCn(b.control_number)}</td>
        <td class="r amt">${tzs(b.amount_tzs)}</td>
        <td class="hide-sm"><span class="pbar"><i data-pct="${pct(b)}"></i></span>${pct(b)}%</td>
        <td class="r">${change}</td></tr>`;
    });
    return html`<div class="scroll-x"><table class="board"><thead><tr>
      <th class="hide-sm">${t('col_posted')}</th><th>${t('institution')}</th><th class="hide-sm">${t('control_number')}</th>
      <th class="r">${t('col_amount')}</th><th class="hide-sm">${t('paid_so_far')}</th><th class="r">${t('col_last')}</th>
      </tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function remember(d) {
    LIVE.prev = new Map(d.bills.map((b) => [b.id, Number(b.confirmed_tzs)]));
  }
  function paintTape(bills) {
    if (LIVE.tape || !bills.length) return;
    LIVE.tape = true;
    const item = (b) => html`<a class="tape-item" href="#/bill/${b.id}"><b>${b.institution_name}</b><span class="cn">${fmtCn(b.control_number)}</span>
      <span>${tzs(left(b))}</span><span class="up">▲ ${pct(b)}%</span></a>`;
    const items = bills.filter((b) => b.status === 'open').slice(0, 16).map(item);
    const el = $('#tape');
    paint(el, html`<div class="tape" aria-label="${t('nav_live')}"><div class="tape-track">${items}${items}</div></div>`);
    el.hidden = false;
  }
  function spark(series) {
    const now = Date.now(); const start = now - 864e5;
    const pts = []; let acc = 0;
    const sorted = (series || []).slice().sort((a, b) => a.t - b.t);
    pts.push([0, 0]);
    sorted.forEach((p) => { acc += Number(p.v); pts.push([Math.max(0, (p.t - start) / 864e5), acc]); });
    pts.push([1, acc]);
    const max = acc || 1;
    const xy = pts.map(([x, y]) => [(x * 300).toFixed(1), (58 - (y / max) * 54).toFixed(1)]);
    const line = 'M' + xy.map((p) => p.join(',')).join(' L');
    return raw(`<svg class="spark" viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true">
      <path d="${line} L300,60 L0,60 Z" fill="var(--up-soft)"/><path d="${line}" fill="none" stroke="var(--up)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`);
  }
  function startLive(draw) {
    const tick = async () => {
      try { const d = await api('/live'); draw(d); remember(d); paintTape(d.bills); } catch (e) {}
    };
    tick();
    LIVE.timer = setInterval(tick, 4000);
  }
  main.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-href]');
    if (tr) location.hash = tr.getAttribute('data-href');
  });

  // Headline word that changes every few seconds, like a ticker for who the bill belongs to.
  let rotTimer = null;
  function startRotation() {
    const words = t('hero_words').split('|');
    let i = 0;
    clearInterval(rotTimer);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    rotTimer = setInterval(() => {
      const pill = $('#rot'); if (!pill) { clearInterval(rotTimer); return; }
      const w = $('.rot-word', pill);
      w.classList.remove('in'); w.classList.add('out');
      setTimeout(() => {
        i = (i + 1) % words.length;
        w.textContent = words[i];
        pill.className = 'rot c' + (i % 4);
        w.classList.remove('out'); void w.offsetWidth; w.classList.add('in');
      }, 260);
    }, 2400);
  }

  // ---------- Views ----------
  const views = {};

  // Sources for the figures in the introduction. Keep these in step with the i18n text.
  const WHY = [
    { src: 'NHIF, via The Citizen', url: 'https://www.thecitizen.co.tz/tanzania/magazines/stakeholders-sound-alarm-on-tanzania-s-health-financing-shortfall-4718856' },
    { src: 'HSSP V Mid-Term Review, 2020 to 2022', url: 'https://ihi.or.tz/media/List_and_report/MTR_Health_Financing_-_REPORT_ahPSAcN.pdf' },
    { src: 'Obayemi et al., KCMC Moshi (2022)', url: 'https://ghrp.biomedcentral.com/articles/10.1186/s41256-022-00265-z' },
    { src: 'World Bank, Fee-Free Basic Education in Tanzania', url: 'https://documents1.worldbank.org/curated/en/356111553606355438/pdf/Gender-Equity-and-Fee-Free-Basic-Education-in-Tanzania.pdf' }
  ];

  views.home = async function () {
    paint(main, html`
      <section class="hero2">
        <p class="motto pop">${t('motto')}</p>
        <h1 class="pop">${t('hero_pre')} <span class="rot c0" id="rot"><span class="rot-dot"></span><span class="rot-word">${t('hero_words').split('|')[0]}</span></span>${t('hero_post')}</h1>
        <p class="lead pop">${t('hero_lead')}</p>
        <div class="row pop"><a class="btn lg primary" href="#/live">${t('see_live')} ${icon.arrow}</a>
          <a class="btn lg" href="#/join/institution">${t('for_institutions')}</a></div>
        <div class="hero-stats pop-group">
          <div><span class="label">${t('st_total')}</span><div class="v up" id="f-total">...</div></div>
          <div><span class="label">${t('st_today')}</span><div class="v" id="f-today">...</div></div>
          <div><span class="label">${t('st_waiting')}</span><div class="v" id="f-open">...</div></div>
        </div>
      </section>
      <section class="howline pop-group">
        ${[1, 2, 3].map((n) => html`<div><b>${t('how_' + n + 't')}</b><span>${t('how_' + n + 'd')}</span></div>`)}
      </section>
      <section class="sp-lg why">
        <div class="why-head"><h2>${t('why_title')}</h2><p class="lead">${t('why_lead')}</p></div>
        <div class="why-grid pop-group">${WHY.map((w, i) => html`<div class="why-item">
          <div class="why-v">${t('why_' + (i + 1) + 'v')}</div><p>${t('why_' + (i + 1) + 't')}</p>
          <a class="why-src" href="${w.url}" target="_blank" rel="noopener noreferrer">${t('source')}: ${w.src}</a></div>`)}</div>
        <p class="why-close">${t('why_close')}</p>
      </section>
      <section class="sp-lg">
        <div class="section-head"><h2>${t('live_title')}</h2><span class="pulse">${t('live')}</span></div>
        <div class="board-wrap" id="board">${raw('<div class="skel"></div>')}</div>
        <div class="row sp-sm"><a class="btn" href="#/live">${t('see_live')} ${icon.arrow}</a><a class="btn ghost" href="#/bills">${t('nav_bills')}</a></div>
      </section>
      <section class="sp-lg cta-band">
        <div><h2>${t('cta_title')}</h2><p class="lead sp-sm">${t('cta_body')}</p></div>
        <a class="btn lg primary" href="#/join/institution">${t('cta_btn')} ${icon.arrow}</a>
      </section>`);
    startRotation();
    const open = (d) => d.bills.filter((b) => b.status === 'open').length;
    startLive((d) => {
      const b = $('#board'); if (!b) return;
      $('#f-total').textContent = tzs(d.total_tzs);
      $('#f-today').textContent = tzs(d.cleared_today);
      $('#f-open').textContent = num(open(d));
      paint(b, boardRows(d.bills, 10));
    });
  };

  views.live = async function () {
    paint(main, html`
      <div class="page-head section-head"><h2>${t('live_title')}</h2><span class="pulse">${t('live')}</span></div>
      <section class="livehead">
        <div><span class="label">${t('st_today')}</span><div class="v up" id="l-today">...</div></div>
        <div><span class="label">${t('payments_today')}</span><div class="v" id="l-count">...</div></div>
        <div><span class="label">${t('st_waiting')}</span><div class="v" id="l-open">...</div></div>
        <div><span class="label">${t('st_total')}</span><div class="v" id="l-total">...</div></div>
      </section>
      <div class="live-grid sp-md">
        <div class="board-wrap" id="board">${raw('<div class="skel"></div>')}</div>
        <aside class="stack">
          <div><span class="label">${t('last_24h')}</span><div id="spark" class="sp-sm"></div></div>
          <div><span class="label">${t('recent_payments')}</span><ul class="feed sp-sm" id="feed"></ul></div>
        </aside>
      </div>`);
    startLive((d) => {
      if (!$('#board')) return;
      $('#l-today').textContent = tzs(d.cleared_today);
      $('#l-count').textContent = num(d.payments_today);
      $('#l-open').textContent = num(d.bills.filter((b) => b.status === 'open').length);
      $('#l-total').textContent = tzs(d.total_tzs);
      paint($('#board'), boardRows(d.bills, 40));
      paint($('#spark'), spark(d.series));
      const seen = LIVE.feedSeen;
      paint($('#feed'), d.feed.map((f) => html`<li class="${seen && !seen.has(f.id) ? 'new' : ''}"><time>${ago(f.reviewed_at)}</time>
        <a href="#/bill/${f.bill_id}">${f.institution_name}</a><span class="chg">+${num(f.amount_tzs)}</span></li>`));
      LIVE.feedSeen = new Set(d.feed.map((f) => f.id));
    });
  };

  views.bills = async function (p, q) {
    const m = await meta();
    const f = { kind: q.kind || '', region: q.region || '', level: q.level || '', ownership: q.ownership || '', sort: q.sort || 'newest', q: q.q || '' };
    const levels = f.kind ? m.LEVELS[f.kind] : m.LEVELS.health.concat(m.LEVELS.school);
    paint(main, html`
      <div class="section-head fade"><div><h2>${t('bills_title')}</h2><p class="muted">${t('bills_sub')}</p></div></div>
      <form class="filters" id="filters" role="search">
        <input class="input search" name="q" value="${f.q}" placeholder="${t('search_ph')}" aria-label="${t('search_ph')}">
        <select class="input" name="kind" aria-label="${t('all_types')}">${opt('', t('all_types'))}${opt('health', t('health'), f.kind === 'health')}${opt('school', t('school'), f.kind === 'school')}</select>
        <select class="input" name="region" aria-label="${t('region')}">${opt('', t('all_regions'))}${m.REGIONS.map((r) => opt(r, r, f.region === r))}</select>
        <select class="input" name="level" aria-label="${t('level')}">${opt('', t('all_levels'))}${levels.map((l) => opt(l, lvl(l), f.level === l))}</select>
        <select class="input" name="sort" aria-label="sort">${['newest', 'expiring', 'nearly', 'smallest'].map((s) => opt(s, t('sort_' + s), f.sort === s))}</select>
      </form>
      <div class="row" id="own-seg">
        <div class="seg" role="group" aria-label="${t('ownership')}">
          ${['', 'government', 'private', 'faith'].map((o) => html`<button type="button" data-act="own" data-v="${o}" aria-pressed="${f.ownership === o}">${o ? own(o) : t('all_ownership')}</button>`)}
        </div>
      </div>
      <div id="list" class="sp-sm">${skeletons(6)}</div>`);

    const form = $('#filters');
    const load = async () => {
      const d = formData(form);
      const ob = $('#own-seg [aria-pressed="true"]');
      d.ownership = ob ? ob.dataset.v : '';
      const qs = new URLSearchParams(Object.entries(d).filter(([, v]) => v)).toString();
      history.replaceState(null, '', '#/bills' + (qs ? '?' + qs : ''));
      try {
        const rows = await api('/bills?' + qs);
        paint($('#list'), rows.length ? html`<div class="bills pop-group">${rows.map(billCard)}</div>` : html`<div class="empty">${t('no_bills')}</div>`);
      } catch (e) { paint($('#list'), html`<div class="empty">${errMsg(e)}</div>`); }
    };
    let deb;
    form.addEventListener('input', (e) => {
      if (e.target.name === 'kind') { // levels depend on type
        const lv = e.target.value ? m.LEVELS[e.target.value] : m.LEVELS.health.concat(m.LEVELS.school);
        paint(form.level, html`${opt('', t('all_levels'))}${lv.map((l) => opt(l, lvl(l)))}`);
      }
      clearTimeout(deb); deb = setTimeout(load, e.target.name === 'q' ? 300 : 0);
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); load(); });
    $('#own-seg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act="own"]'); if (!b) return;
      $$('#own-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      load();
    });
    load();
  };

  function payInstructions(b) {
    if (b.pay_via === 'bank') return [t('bank_1', { bank: b.pay_via_detail || '' }), t('bank_2')];
    if (b.pay_via === 'lipa') return [t('lipa_1'), t('lipa_2', { lipa: b.pay_via_detail || '' })];
    return [t('gepg_1'), t('gepg_2'), t('gepg_3'), t('gepg_4')];
  }

  views.bill = async function (p) {
    paint(main, html`<div class="skel"></div>`);
    let b;
    try { b = await api('/bills/' + encodeURIComponent(p[0])); }
    catch (e) { paint(main, html`<div class="empty">${t('not_found')}</div>`); return; }
    const m = await meta();
    const rem = left(b);
    const isLive = b.status === 'open' && (!b.expires_on || new Date(b.expires_on + 'T23:59:59') >= new Date());
    const donor = S.me && S.me.role === 'donor' ? S.me : null;

    const chips = [5000, 10000, 20000, 50000].filter((a) => a < rem);
    const payPanel = !isLive ? html`<div class="card pay"><div class="banner"><div>${b.status === 'cleared' ? t('cleared') + '. ' : ''}${t('bill_closed_msg')}</div></div>
        <a class="btn block sp-sm" href="#/bills">${t('another')}</a></div>`
      : html`<div class="card pay" id="pay">
        <h3>${t('pay_title')}</h3>
        <div class="stack sp-sm">
          <div class="pstep on"><span class="n">1</span><div><h4>${t('p1')}</h4>
            <div class="cn-box"><span class="cn">${fmtCn(b.control_number)}</span>
              <button class="btn sm" type="button" data-act="copy" data-v="${b.control_number}">${icon.copy} ${t('copy')}</button></div></div></div>
          <div class="pstep on"><span class="n">2</span><div><h4>${t('p2')}</h4>
            <ol class="howto">${payInstructions(b).map((s) => html`<li>${s}</li>`)}</ol>
            <p class="check-name">${t('check_name', { inst: b.institution_name })}</p></div></div>
          <div class="pstep on"><span class="n">3</span><div><h4>${t('p3')}</h4>
            <form id="payform" class="stack" novalidate>
              <label class="field"><span>${t('amount')}</span>
                <input class="input mono" name="amount" inputmode="numeric" autocomplete="off" value="${b.partial_allowed ? '' : rem}" ${b.partial_allowed ? '' : raw('readonly')} placeholder="${num(Math.min(rem, 10000))}"></label>
              ${b.partial_allowed ? html`<div class="chips">${chips.map((a) => html`<button type="button" data-act="amt" data-v="${a}">${num(a)}</button>`)}
                <button type="button" data-act="amt" data-v="${rem}">${t('all_left')} · ${num(rem)}</button></div>` : ''}
              <label class="field"><span>${t('channel')}</span>
                <select class="input" name="channel">${m.CHANNELS.map((c) => opt(c, t('ch_' + c)))}</select></label>
              <label class="field"><span>${t('receipt_ref')}</span>
                <input class="input mono" name="payment_ref" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="QK72H1XY3P">
                <small>${t('receipt_hint')}</small></label>
              ${donor ? '' : html`<label class="field"><span>${t('notify_email')}</span>
                <input class="input" type="email" name="email" autocomplete="email" placeholder="you@example.com">
                <small>${t('notify_email_hint')}</small></label>`}
              <p class="small muted">${donor ? t('giving_as', { alias: donor.alias }) : t('giving_anon')}</p>
              <div class="err" role="alert"></div>
              <button class="btn lg primary block" type="submit">${t('submit_payment')}</button>
            </form></div></div>
        </div></div>`;

    paint(main, html`
      <a class="back" href="#/bills">${icon.back} ${t('back')}</a>
      <div class="detail fade">
        <div class="stack">
          <div class="card pad-lg">
            <div class="row between"><span class="cat">${cat(b.category)}</span>${statusTag(b.status)}</div>
            <h2 class="sp-sm">${tzs(rem)} <span class="muted small">${t('left_to_pay')}</span></h2>
            <div class="bar lg sp-sm"><i data-pct="${pct(b)}"></i></div>
            <div class="row between small muted sp-sm mono"><span>${pct(b)}% · ${num(b.gifts)} ${t(b.gifts === 1 ? 'gift' : 'gifts')}</span><span>${t('of')} ${tzs(b.amount_tzs)}</span></div>
            ${b.note ? html`<p class="lead sp-md">${b.note}</p>` : ''}
            <hr class="divider">
            <dl class="kv">
              <dt>${t('bill_amount')}</dt><dd class="num">${tzs(b.amount_tzs)}</dd>
              <dt>${t('paid_so_far')}</dt><dd class="num">${tzs(b.confirmed_tzs)}</dd>
              <dt>${t('expires')}</dt><dd>${b.expires_on ? fdate(b.expires_on) : t('no_expiry')}</dd>
              <dt>${t('posted')}</dt><dd>${fdate(b.created_at)}</dd>
              <dt></dt><dd><span class="tag">${b.partial_allowed ? t('partial_ok') : t('partial_no')}</span></dd>
            </dl>
          </div>
          <a class="card flat" href="#/i/${b.institution_id}">
            <div class="row between"><div><div class="small muted">${t('institution')}</div><div class="bill-inst">${b.institution_name}</div>
              <div class="bill-loc">${b.district}, ${b.region}</div></div><span class="tag accent"><span class="dot"></span>${t('reg_verified')}</span></div>
            <div class="row sp-sm"><span class="tag">${lvl(b.level)}</span><span class="tag">${own(b.ownership)}</span></div>
          </a>
        </div>
        ${payPanel}
      </div>`);

    const pf = $('#payform');
    if (!pf) return;
    pf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(pf);
      const amount = parseInt(String(d.amount).replace(/[^\d]/g, ''), 10);
      if (!amount) return showErr(pf, t('e_invalid_amount'));
      if (!d.payment_ref) return showErr(pf, t('e_invalid_payment_ref'));
      busy(pf, true); showErr(pf, '');
      try {
        const r = await api('/bills/' + b.id + '/contributions', { body: { amount, channel: d.channel, payment_ref: d.payment_ref.replace(/\s/g, ''), email: d.email || undefined } });
        store.set('tk_last_code', r.tracking_code);
        paint($('#pay'), html`<div class="success fade">
          <div class="ring">${icon.check}</div><h3>${t('thanks')}</h3>
          <p class="muted">${t('thanks_body')}</p>
          ${r.emailed ? html`<p class="small muted">${t('emailed_note')}</p>` : ''}
          <div class="row"><span class="code">${r.tracking_code}</span></div>
          <div class="stack sp-md">
            <button class="btn" type="button" data-act="copy" data-v="${r.tracking_code}">${icon.copy} ${t('copy')}</button>
            <a class="btn" href="#/track/${r.tracking_code}">${t('track_it')}</a>
            <a class="btn primary" href="#/bills">${t('another')}</a>
            ${donor ? '' : html`<a class="btn ghost" href="#/join/donor">${t('create_account')}</a>`}
          </div></div>`);
      } catch (er) { showErr(pf, er); busy(pf, false); }
    });
    $('#pay').addEventListener('click', (e) => {
      const c = e.target.closest('[data-act="amt"]'); if (!c) return;
      pf.amount.value = c.dataset.v; pf.payment_ref.focus();
    });
  };

  views.institution = async function (p) {
    let i;
    try { i = await api('/institutions/' + encodeURIComponent(p[0])); }
    catch (e) { paint(main, html`<div class="empty">${t('not_found')}</div>`); return; }
    paint(main, html`
      <a class="back" href="#/bills">${icon.back} ${t('back')}</a>
      <div class="card pad-lg fade">
        <span class="tag accent"><span class="dot"></span>${t('reg_verified')}</span>
        <h2 class="sp-sm">${i.name}</h2>
        <p class="muted">${i.district}, ${i.region}</p>
        <div class="row"><span class="tag">${lvl(i.level)}</span><span class="tag">${own(i.ownership)}</span></div>
        <div class="grid g3 sp-md">
          <div class="stat"><span class="k">${t('k_received')}</span><span class="v">${tzs(i.total_tzs)}</span></div>
          <div class="stat"><span class="k">${t('k_cleared')}</span><span class="v">${num(i.bills_cleared)}</span></div>
          <div class="stat"><span class="k">${t('k_open')}</span><span class="v">${num(i.bills.length)}</span></div>
        </div>
      </div>
      <div class="sp-md">${i.bills.length ? html`<div class="bills">${i.bills.map(billCard)}</div>` : html`<div class="empty">${t('no_bills')}</div>`}</div>`);
  };

  views.board = async function (p, q) {
    const tab = ['givers', 'institutions', 'regions'].includes(q.tab) ? q.tab : 'givers';
    const period = q.period === 'month' ? 'month' : 'all';
    const dtype = ['individual', 'organisation'].includes(q.dtype) ? q.dtype : '';
    const link = (o) => '#/board?' + new URLSearchParams(Object.assign({ tab, period, dtype }, o)).toString();
    paint(main, html`
      <div class="section-head fade"><div><h2>${t('board_title')}</h2><p class="muted">${t('board_sub')}</p></div>
        <div class="seg">${['all', 'month'].map((x) => html`<a class="btn sm ${x === period ? '' : 'ghost'}" href="${link({ period: x })}">${t(x === 'all' ? 'all_time' : 'this_month')}</a>`)}</div></div>
      <nav class="tabs">${['givers', 'institutions', 'regions'].map((x) => html`<a href="${link({ tab: x })}" ${x === tab ? raw('aria-current="page"') : ''}>${t(x)}</a>`)}</nav>
      ${tab === 'givers' ? html`<div class="seg sp-sm">${[['', 'all_givers'], ['individual', 'individuals'], ['organisation', 'organisations']].map(([v, k]) => html`<a href="${link({ dtype: v })}" aria-current="${v === dtype}">${t(k)}</a>`)}</div>` : ''}
      <div id="board" class="sp-sm">${skeletons(1)}</div>`);

    const path = { givers: '/leaderboard/donors', institutions: '/leaderboard/institutions', regions: '/leaderboard/regions' }[tab];
    let rows = [];
    try { rows = await api(path + '?period=' + period + (tab === 'givers' && dtype ? '&dtype=' + dtype : '')); } catch (e) {}
    const el = $('#board');
    if (!rows.length) return paint(el, html`<div class="empty">${t('no_board')}</div>`);

    const name = (r) => tab === 'givers' ? html`${r.alias}${r.donor_type === 'organisation' ? html` <span class="tag">${t('org_badge')}</span>` : ''}` : tab === 'regions' ? r.region : r.name;
    const sub = (r) => tab === 'givers' ? html`${num(r.points)} ${t('points')} · ${num(r.bills)} ${t('bills_helped')}`
      : tab === 'regions' ? html`${num(r.bills_helped)} ${t('bills_helped')} · ${num(r.institutions)} ${t('institutions').toLowerCase()}`
      : html`${lvl(r.level)} · ${r.region} · ${num(r.bills_helped)} ${t('bills_helped')}`;
    const href = (r) => tab === 'institutions' ? '#/i/' + r.id : null;
    const top = rows.slice(0, 3);
    const order = top;
    paint(el, html`
      <div class="podium">${order.map((r) => {
        const rank = rows.indexOf(r) + 1;
        return html`<div class="card pod p${rank} fade"><div class="rank">${rank}</div><div class="name">${name(r)}</div>
          <div class="amt">${tzs(r.total_tzs)}</div><div class="small muted sp-sm">${sub(r)}</div></div>`;
      })}</div>
      ${rows.length > 3 ? html`<div class="card"><div class="list">${rows.slice(3).map((r, i) => html`
        <div class="li"><div><span class="rankno">${i + 4}</span>${href(r) ? html`<a href="${href(r)}"><b>${name(r)}</b></a>` : html`<b>${name(r)}</b>`}
          <div class="small muted">${sub(r)}</div></div><div class="num">${tzs(r.total_tzs)}</div></div>`)}</div></div>` : ''}`);
  };

  views.track = async function (p) {
    const code = p[0] || store.get('tk_last_code') || '';
    paint(main, html`
      <div class="auth fade">
        <h2>${t('track_title')}</h2><p class="muted">${t('track_sub')}</p>
        <form id="trackf" class="row sp-sm" novalidate>
          <input class="input mono" name="code" value="${code}" placeholder="MT-XXXX-XXXX" autocapitalize="characters" spellcheck="false" aria-label="code">
          <button class="btn primary" type="submit">${t('track_btn')}</button>
        </form>
        <div id="tres" class="sp-md"></div>
      </div>`);
    const f = $('#trackf');
    const run = async (c) => {
      if (!c) return;
      try {
        const r = await api('/track/' + encodeURIComponent(c));
        paint($('#tres'), html`<div class="card fade">
          <div class="row between"><span class="code">${r.tracking_code}</span>${statusTag(r.status)}</div>
          <p class="muted">${t('track_' + r.status + '_d')}</p>
          <dl class="kv"><dt>${t('amount')}</dt><dd class="num">${tzs(r.amount_tzs)}</dd>
            <dt>${t('institution')}</dt><dd>${r.institution_name}</dd>
            <dt>${t('category')}</dt><dd>${cat(r.category)}</dd>
            <dt>${t('posted')}</dt><dd>${fdate(r.created_at)}</dd></dl>
          <a class="btn sp-sm" href="#/bill/${r.bill_id}">${t('nav_bills')} ${icon.arrow}</a></div>`);
      } catch (e) { paint($('#tres'), html`<div class="empty">${e.status === 404 ? t('not_found') : errMsg(e)}</div>`); }
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); run(f.code.value.trim()); });
    run(code);
  };

  views.about = async function () {
    paint(main, html`
      <div class="auth wide fade">
        <span class="eyebrow">Msaada Tutani</span>
        <h1 class="sp-sm">${t('about_title')}</h1>
        <p class="lead sp-sm">${t('about_p1')}</p>
        <div class="grid g3 steps sp-md">${[1, 2, 3].map((n) => html`<div class="step"><h3>${t('how_' + n + 't')}</h3><p>${t('how_' + n + 'd')}</p></div>`)}</div>
        <div class="card sp-lg"><div class="list">${[1, 2, 3, 4, 5, 6].map((n) => html`
          <div class="li"><div><h3>${t('about_q' + n)}</h3><p class="muted">${t('about_a' + n)}</p></div><span></span></div>`)}</div></div>
        <div class="row sp-md"><a class="btn lg primary" href="#/bills">${t('browse_bills')} ${icon.arrow}</a><a class="btn lg" href="#/join/institution">${t('cta_btn')}</a></div>
      </div>`);
  };

  // ---------- Auth ----------
  function afterAuth(r) {
    setToken(r.token);
    loadMe().then(() => { location.hash = r.role === 'institution' ? '#/inst' : r.role === 'admin' ? '#/admin' : '#/me'; });
  }

  views.login = async function () {
    paint(main, html`
      <div class="auth fade"><div class="card pad-lg">
        <h2>${t('login_title')}</h2>
        <form id="lf" class="stack sp-md" novalidate>
          <label class="field"><span>${t('email')}</span><input class="input" type="email" name="email" autocomplete="email" required></label>
          <label class="field"><span>${t('password')}</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>
          <div class="err" role="alert"></div>
          <button class="btn lg primary block" type="submit">${t('sign_in')}</button>
        </form>
        <p class="small muted sp-sm"><a href="#/forgot">${t('forgot')}</a> · ${t('no_account')} <a href="#/join">${t('join')}</a></p>
      </div></div>`);
    const f = $('#lf');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); busy(f, true); showErr(f, '');
      try { afterAuth(await api('/auth/login', { body: formData(f) })); }
      catch (er) { showErr(f, er); busy(f, false); }
    });
  };

  views.forgot = async function () {
    paint(main, html`
      <div class="auth fade"><div class="card pad-lg">
        <h2>${t('forgot_title')}</h2><p class="muted">${t('forgot_sub')}</p>
        <form id="ff" class="stack sp-md" novalidate>
          <label class="field"><span>${t('email')}</span><input class="input" type="email" name="email" autocomplete="email"></label>
          <div class="err" role="alert"></div>
          <button class="btn lg primary block" type="submit">${t('send_link')}</button>
        </form>
      </div></div>`);
    const f = $('#ff');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); busy(f, true); showErr(f, '');
      try { await api('/auth/forgot', { body: { email: f.email.value.trim() } }); paint(f, html`<div class="banner ok">${t('link_sent')}</div>`); }
      catch (er) { showErr(f, er); busy(f, false); }
    });
  };

  views.reset = async function (p) {
    paint(main, html`
      <div class="auth fade"><div class="card pad-lg">
        <h2>${t('forgot_title')}</h2>
        <form id="rf" class="stack sp-md" novalidate>
          <label class="field"><span>${t('new_password')}</span><input class="input" type="password" name="password" autocomplete="new-password"><small>${t('pw_hint')}</small></label>
          <div class="err" role="alert"></div>
          <button class="btn lg primary block" type="submit">${t('set_password')}</button>
        </form>
      </div></div>`);
    const f = $('#rf');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); busy(f, true); showErr(f, '');
      try { afterAuth(await api('/auth/reset', { body: { token: p[0], password: f.password.value } })); }
      catch (er) { showErr(f, er); busy(f, false); }
    });
  };

  views.privacy = async function () {
    paint(main, html`
      <div class="auth wide fade">
        <h1 class="sp-md">${t('privacy_title')}</h1>
        <div class="card sp-md"><div class="list">${[1, 2, 3, 4, 5].map((n) => html`<div class="li"><p class="lead">${t('privacy_p' + n)}</p><span></span></div>`)}</div></div>
      </div>`);
  };

  views.join = async function () {
    paint(main, html`
      <div class="auth wide fade">
        <h2>${t('join_title')}</h2><p class="muted">${t('join_sub')}</p>
        <div class="choice sp-md">
          <a class="card" href="#/join/donor"><span class="ico">${icon.heart}</span><h3>${t('join_donor_t')}</h3><p class="muted">${t('join_donor_d')}</p></a>
          <a class="card" href="#/join/institution"><span class="ico">${icon.build}</span><h3>${t('join_inst_t')}</h3><p class="muted">${t('join_inst_d')}</p></a>
        </div>
        <p class="small muted sp-md">${t('have_account')} <a href="#/login">${t('sign_in')}</a></p>
      </div>`);
  };

  views.joinDonor = async function () {
    const m = await meta();
    paint(main, html`
      <div class="auth wide fade"><a class="back" href="#/join">${icon.back} ${t('back')}</a><div class="card pad-lg">
        <h2>${t('donor_title')}</h2>
        <form id="df" class="stack sp-md" novalidate>
          <div class="seg full" id="dtypeseg" role="group">
            <button type="button" data-v="individual" aria-pressed="true">${t('dtype_individual')}</button>
            <button type="button" data-v="organisation" aria-pressed="false">${t('dtype_org')}</button>
          </div>
          <input type="hidden" name="donor_type" value="individual">
          <small class="muted" id="dtypehint" hidden>${t('dtype_hint')}</small>

          <div id="ind" class="stack">
            <div class="grid g2">
              <label class="field"><span>${t('alias')}</span><input class="input" name="alias" maxlength="32" autocomplete="nickname" placeholder="Rafiki"><small>${t('alias_hint')}</small></label>
              <label class="field"><span>${t('full_name')}</span><input class="input" name="full_name" maxlength="80" autocomplete="name"><small>${t('full_name_hint')}</small></label>
            </div>
          </div>

          <div id="org" class="stack" hidden>
            <div class="grid g2">
              <label class="field"><span>${t('org_name')}</span><input class="input" name="org_name" maxlength="120" autocomplete="organization"></label>
              <label class="field"><span>${t('org_type')}</span><select class="input" name="org_type">${opt('', t('choose'))}${m.ORG_TYPES.map((o) => opt(o, t('ot_' + o)))}</select></label>
              <label class="field"><span>${t('org_reg')}</span><input class="input mono" name="org_reg_no" maxlength="40"></label>
              <label class="field"><span>${t('sec_contact')}</span><input class="input" name="contact_name" maxlength="80" autocomplete="name"></label>
            </div>
            <label class="field"><span>${t('public_name')}</span><input class="input" name="org_alias" maxlength="60"><small>${t('public_name_hint')}</small></label>
          </div>

          <div class="grid g2">
            <label class="field"><span>${t('email')}</span><input class="input" type="email" name="email" autocomplete="email"><small>${t('email_donor_hint')}</small></label>
            <label class="field"><span>${t('password')}</span><input class="input" type="password" name="password" autocomplete="new-password"><small>${t('pw_hint')}</small></label>
            <label class="field"><span>${t('phone_opt')}</span><input class="input mono" name="phone" inputmode="tel" autocomplete="tel" placeholder="${t('phone_ph')}"></label>
            <label class="field"><span>${t('region_opt')}</span><select class="input" name="region">${opt('', t('choose'))}${m.REGIONS.map((r) => opt(r, r))}</select></label>
          </div>
          <label class="check"><input type="checkbox" name="hide_from_board"> ${t('hide_board')}</label>
          <div class="err" role="alert"></div>
          <button class="btn lg primary block" type="submit">${t('create_account')}</button>
        </form>
        <p class="small muted sp-sm">${t('have_account')} <a href="#/login">${t('sign_in')}</a></p>
      </div></div>`);
    const f = $('#df');
    $('#dtypeseg').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      $$('#dtypeseg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      f.donor_type.value = b.dataset.v;
      const org = b.dataset.v === 'organisation';
      $('#org').hidden = !org; $('#ind').hidden = org; $('#dtypehint').hidden = !org;
    });
    // The public name follows the organisation name until the donor edits it.
    let aliasTouched = false;
    f.org_alias.addEventListener('input', () => { aliasTouched = true; });
    f.org_name.addEventListener('input', () => { if (!aliasTouched) f.org_alias.value = f.org_name.value; });
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); busy(f, true); showErr(f, '');
      const d = formData(f);
      d.hide_from_board = !!f.hide_from_board.checked;
      if (d.donor_type === 'organisation') { d.alias = d.org_alias || d.org_name; delete d.full_name; }
      else { delete d.org_name; delete d.org_type; delete d.org_reg_no; delete d.contact_name; }
      delete d.org_alias;
      Object.keys(d).forEach((k) => { if (d[k] === '') delete d[k]; });
      try { afterAuth(await api('/auth/donor/signup', { body: d })); }
      catch (er) { showErr(f, er); busy(f, false); }
    });
  };

  views.joinInst = async function () {
    const m = await meta();
    paint(main, html`
      <div class="auth wide fade"><a class="back" href="#/join">${icon.back} ${t('back')}</a><div class="card pad-lg">
        <h2>${t('inst_title')}</h2><p class="muted">${t('inst_sub')}</p>
        <form id="if" class="stack sp-md" novalidate>
          <div class="form-sec">${t('sec_type')}</div>
          <div class="seg full" id="kindseg" role="group">
            <button type="button" data-v="health" aria-pressed="true">${t('kind_health')}</button>
            <button type="button" data-v="school" aria-pressed="false">${t('kind_school')}</button>
          </div>
          <input type="hidden" name="kind" value="health">
          <div class="seg full" id="ownseg" role="group" aria-label="${t('ownership')}">
            ${m.OWNERSHIP.map((o, i) => html`<button type="button" data-v="${o}" aria-pressed="${i === 0}">${own(o)}</button>`)}
          </div>
          <input type="hidden" name="ownership" value="${m.OWNERSHIP[0]}">

          <div class="form-sec">${t('sec_details')}</div>
          <div class="field ta">
            <span>${t('name')}</span>
            <input class="input" name="name" id="instname" maxlength="120" autocomplete="off" placeholder="${t('search_inst')}"
              role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="talist">
            <ul class="ta-list" id="talist" role="listbox" hidden></ul>
            <small id="tahint">${t('cat_hint')}</small>
            <input type="hidden" name="catalogue_id" value="">
          </div>
          <div class="grid g2">
            <label class="field"><span id="reglabel">${t('reg_health')}</span><input class="input mono" name="reg_no" maxlength="40" autocapitalize="characters"><small id="reghint">${t('reg_hint_health')}</small></label>
            <label class="field"><span>${t('level')}</span><select class="input" name="level" id="levelsel">${opt('', t('choose'))}${m.LEVELS.health.map((l) => opt(l, lvl(l)))}</select></label>
            <label class="field"><span>${t('region')}</span><select class="input" name="region">${opt('', t('choose'))}${m.REGIONS.map((r) => opt(r, r))}</select></label>
            <label class="field"><span>${t('district')}</span><input class="input" name="district" maxlength="60"></label>
          </div>

          <div class="form-sec">${t('sec_contact')}</div>
          <div class="grid g2">
            <label class="field"><span>${t('contact_name')}</span><input class="input" name="contact_name" maxlength="80" autocomplete="name"></label>
            <label class="field"><span>${t('contact_title')}</span><input class="input" name="contact_title" maxlength="80" placeholder="${t('contact_title_ph')}"></label>
            <label class="field"><span>${t('phone')}</span><input class="input mono" name="phone" inputmode="tel" autocomplete="tel" placeholder="${t('phone_ph')}"></label>
            <label class="field"><span>${t('email')}</span><input class="input" type="email" name="email" autocomplete="email"><small>${t('email_inst_hint')}</small></label>
          </div>

          <div class="form-sec">${t('sec_login')}</div>
          <label class="field"><span>${t('password')}</span><input class="input" type="password" name="password" autocomplete="new-password"><small>${t('pw_hint')}</small></label>
          <label class="check"><input type="checkbox" name="agree"> ${t('agree_inst')}</label>
          <div class="err" role="alert"></div>
          <button class="btn lg primary block" type="submit">${t('register')}</button>
        </form>
      </div></div>`);

    const f = $('#if');
    const seg = (id, field, onChange) => $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      $$(id + ' button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      f[field].value = b.dataset.v;
      if (onChange) onChange(b.dataset.v);
    });
    seg('#kindseg', 'kind', (k) => {
      $('#reglabel').textContent = t('reg_' + k);
      $('#reghint').textContent = t('reg_hint_' + k);
      paint($('#levelsel'), html`${opt('', t('choose'))}${m.LEVELS[k].map((l) => opt(l, lvl(l)))}`);
    });
    seg('#ownseg', 'ownership');

    // Type-ahead over the catalogue. Picking an entry fills the details; "not on the list" lets
    // the institution type everything itself.
    const list = $('#talist'); const nameIn = $('#instname');
    let items = []; let active = -1; let deb; let seq = 0;
    const close = () => { list.hidden = true; nameIn.setAttribute('aria-expanded', 'false'); active = -1; };
    const setOwn = (o) => { if (!o) return; f.ownership.value = o; $$('#ownseg button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === o))); };
    const draw = () => {
      paint(list, html`${items.map((c, i) => html`<li role="option" id="ta${i}" data-i="${i}" class="${c.registered ? 'dis' : ''} ${i === active ? 'on' : ''}" aria-selected="${i === active}">
          <b>${c.name}</b><span>${lvl(c.level)}${c.region ? ' · ' + c.region : ''}${c.registered ? html` · <em>${t('already_reg')}</em>` : ''}</span></li>`)}
        <li role="option" id="ta${items.length}" data-i="other" class="other ${active === items.length ? 'on' : ''}">${t('not_listed')}</li>`);
      list.hidden = false; nameIn.setAttribute('aria-expanded', 'true');
      if (active >= 0) nameIn.setAttribute('aria-activedescendant', 'ta' + active);
    };
    const pick = (key) => {
      if (key === 'other' || key === String(items.length)) {
        f.catalogue_id.value = ''; $('#tahint').textContent = t('cat_hint'); close(); f.reg_no.focus(); return;
      }
      const c = items[Number(key)]; if (!c || c.registered) return;
      nameIn.value = c.name; f.catalogue_id.value = c.id;
      setOwn(c.ownership);
      if (c.region) f.region.value = c.region;
      if (c.district) f.district.value = c.district;
      f.level.value = c.level;
      if (c.reg_no) f.reg_no.value = c.reg_no;
      $('#tahint').textContent = t('from_catalogue');
      close(); (c.reg_no ? f.contact_name : f.reg_no).focus();
    };
    nameIn.addEventListener('input', () => {
      f.catalogue_id.value = ''; $('#tahint').textContent = t('cat_hint');
      clearTimeout(deb);
      const q = nameIn.value.trim();
      if (q.length < 2) { close(); return; }
      deb = setTimeout(async () => {
        const my = ++seq;
        try { const r = await api('/catalogue?kind=' + f.kind.value + '&q=' + encodeURIComponent(q)); if (my !== seq) return; items = r; active = -1; draw(); }
        catch (e) { close(); }
      }, 140);
    });
    nameIn.addEventListener('keydown', (e) => {
      if (list.hidden) return;
      const n = items.length + 1;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % n; draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + n) % n; draw(); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(String(active)); }
      else if (e.key === 'Escape') close();
    });
    list.addEventListener('mousedown', (e) => { const li = e.target.closest('li'); if (li) { e.preventDefault(); pick(li.dataset.i); } });
    nameIn.addEventListener('blur', () => setTimeout(close, 120));
    $('#kindseg').addEventListener('click', () => { f.catalogue_id.value = ''; close(); });

    f.addEventListener('submit', async (e) => {
      e.preventDefault(); showErr(f, '');
      if (!f.agree.checked) return showErr(f, t('e_agree'));
      busy(f, true);
      const d = formData(f); delete d.agree;
      if (!d.catalogue_id) delete d.catalogue_id;
      try { afterAuth(await api('/auth/institution/signup', { body: d })); }
      catch (er) { showErr(f, er); busy(f, false); }
    });
  };

  // ---------- Donor dashboard ----------
  views.me = async function () {
    if (!S.me || S.me.role !== 'donor') { location.hash = '#/login'; return; }
    paint(main, skeletons(1));
    const [s, list] = await Promise.all([api('/me/summary'), api('/me/contributions')]);
    paint(main, html`
      <div class="section-head fade"><div><span class="eyebrow">${S.me.alias}</span><h2 class="sp-sm">${t('me_title')}</h2></div>
        <a class="btn primary" href="#/bills">${t('browse_bills')} ${icon.arrow}</a></div>
      <div class="grid g4">
        <div class="card stat"><span class="k">${t('me_total')}</span><span class="v">${tzs(s.total_tzs)}</span></div>
        <div class="card stat"><span class="k">${t('me_points')}</span><span class="v">${num(s.points)}</span></div>
        <div class="card stat"><span class="k">${t('me_rank')}</span><span class="v">${s.rank ? '#' + s.rank : '-'}</span></div>
        <div class="card stat"><span class="k">${t('me_gifts')}</span><span class="v">${num(s.bills)}</span></div>
      </div>
      <div class="grid sp-md detail">
        <div class="card"><h3>${t('history')}</h3>
          ${list.length ? html`<div class="list sp-sm">${list.map((c) => html`
            <div class="li"><div><a href="#/bill/${c.bill_id}"><b>${c.institution_name}</b></a>
              <div class="small muted">${cat(c.category)} · ${c.region} · ${fdate(c.created_at)} · <span class="mono">${c.tracking_code}</span></div></div>
              <div class="stack"><span class="num">${tzs(c.amount_tzs)}</span>${statusTag(c.status)}</div></div>`)}</div>`
            : html`<div class="empty sp-sm">${t('me_none')}</div>`}
        </div>
        <div class="card"><h3>${t('profile')}</h3>
          <form id="pf" class="stack sp-sm" novalidate>
            <label class="field"><span>${t('alias')}</span><input class="input" name="alias" maxlength="32" value="${S.me.alias}"><small>${t('alias_hint')}</small></label>
            <label class="check"><input type="checkbox" name="hide_from_board" ${S.me.hide_from_board ? raw('checked') : ''}> ${t('hide_board')}</label>
            <div class="err" role="alert"></div>
            <button class="btn" type="submit">${t('save')}</button>
          </form></div>
      </div>`);
    const f = $('#pf');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); busy(f, true); showErr(f, '');
      try {
        await api('/me/profile', { method: 'PATCH', body: { alias: f.alias.value.trim(), hide_from_board: f.hide_from_board.checked } });
        await loadMe(); toast(t('saved')); route();
      } catch (er) { showErr(f, er); busy(f, false); }
    });
  };

  // ---------- Institution dashboard ----------
  views.inst = async function (p) {
    if (!S.me || S.me.role !== 'institution') { location.hash = '#/login'; return; }
    const tab = ['post', 'bills', 'confirm'].includes(p[0]) ? p[0] : 'overview';
    const ov = await api('/inst/overview');
    const inst = ov.institution;
    const verified = inst.status === 'verified';

    const banner = verified ? '' : html`<div class="banner warn sp-sm"><div><b>${t(inst.status === 'pending' ? 'pending_banner_t' : inst.status + '_banner_t')}</b>
      <div class="small">${inst.status === 'pending' ? t('pending_banner_d', { reg: inst.reg_no }) : (inst.review_note || '') + ' ' + t('contact_us')}</div></div></div>`;

    const tabs = [['overview', 'tab_overview'], ['post', 'tab_post'], ['bills', 'tab_bills'], ['confirm', 'tab_confirm']];
    paint(main, html`
      <div class="section-head fade"><div><span class="eyebrow">${lvl(inst.level)} · ${inst.region}</span><h2 class="sp-sm">${inst.name}</h2>
        <p class="muted mono small">${inst.reg_no}</p></div>
        ${verified ? html`<span class="tag accent"><span class="dot"></span>${t('reg_verified')}</span>` : statusTag('pending')}</div>
      ${banner}
      <nav class="tabs sp-md">${tabs.map(([k, l]) => html`<a href="#/inst${k === 'overview' ? '' : '/' + k}" ${k === tab ? raw('aria-current="page"') : ''}>${t(l)}${k === 'confirm' && ov.pending ? html`<span class="badge">${ov.pending}</span>` : ''}</a>`)}</nav>
      <div id="tab"></div>`);
    const el = $('#tab');
    const m = await meta();

    if (tab === 'overview') {
      paint(el, html`
        <div class="grid g4 fade">
          <div class="card stat"><span class="k">${t('k_open')}</span><span class="v">${num(ov.open_bills)}</span></div>
          <div class="card stat"><span class="k">${t('k_cleared')}</span><span class="v">${num(ov.cleared_bills)}</span></div>
          <div class="card stat"><span class="k">${t('k_received')}</span><span class="v">${tzs(ov.received_tzs)}</span></div>
          <a class="card stat" href="#/inst/confirm"><span class="k">${t('k_pending')}</span><span class="v ${ov.pending ? 'accent' : ''}">${num(ov.pending)}</span></a>
        </div>
        ${verified ? html`<div class="row sp-md"><a class="btn lg primary" href="#/inst/post">${t('post_btn')} ${icon.arrow}</a>
          ${ov.pending ? html`<a class="btn lg" href="#/inst/confirm">${t('tab_confirm')} (${ov.pending})</a>` : ''}
          <a class="btn lg ghost" href="#/i/${inst.id}">${t('reg_verified')} ${icon.arrow}</a></div>` : ''}`);
    }

    if (tab === 'post') {
      if (!verified) return paint(el, html`<div class="empty">${t('e_not_verified')}</div>`);
      const today = new Date().toISOString().slice(0, 10);
      paint(el, html`
        <div class="card pad-lg auth wide fade">
          <h3>${t('post_title')}</h3><p class="muted">${t('post_sub')}</p>
          <form id="bf" class="stack sp-md" novalidate>
            <div class="grid g2">
              <label class="field"><span>${t('control_number')}</span><input class="input mono" name="control_number" inputmode="numeric" maxlength="30" placeholder="9912 3456 7890"></label>
              <label class="field"><span>${t('amount')}</span><input class="input mono" name="amount" inputmode="numeric" placeholder="250,000"></label>
            </div>
            <div class="field"><span>${t('pay_via')}</span>
              <div class="seg full" id="viaseg">${m.PAY_VIA.map((x, i) => html`<button type="button" data-v="${x}" aria-pressed="${i === 0}">${t('via_' + x)}</button>`)}</div>
              <input type="hidden" name="pay_via" value="gepg"></div>
            <label class="field" id="viadetail" hidden><span id="viadetail-l">${t('bank_name')}</span><input class="input" name="pay_via_detail" maxlength="60"></label>
            <div class="grid g2">
              <label class="field"><span>${t('category')}</span><select class="input" name="category">${m.CATEGORIES[inst.kind].map((c) => opt(c, cat(c)))}</select></label>
              <label class="field"><span>${t('expires_on')}</span><input class="input" type="date" name="expires_on" min="${today}"></label>
            </div>
            <label class="field"><span>${t('note')}</span><textarea class="input" name="note" maxlength="280" placeholder="${t('note_ph')}"></textarea>
              <small>${t('privacy_warn')}</small></label>
            <label class="check"><input type="checkbox" name="partial_allowed" checked> ${t('allow_partial')}</label>
            <div class="err" role="alert"></div>
            <button class="btn lg primary" type="submit">${t('post_btn')}</button>
          </form></div>`);
      const f = $('#bf');
      $('#viaseg').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        $$('#viaseg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        f.pay_via.value = b.dataset.v;
        $('#viadetail').hidden = b.dataset.v === 'gepg';
        $('#viadetail-l').textContent = t(b.dataset.v === 'bank' ? 'bank_name' : 'lipa_number');
      });
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); busy(f, true); showErr(f, '');
        const d = formData(f);
        d.amount = parseInt(String(d.amount).replace(/[^\d]/g, ''), 10) || 0;
        d.control_number = String(d.control_number).replace(/\s/g, '');
        d.partial_allowed = f.partial_allowed.checked;
        if (!d.expires_on) delete d.expires_on;
        try { await api('/inst/bills', { body: d }); toast(t('posted_ok')); location.hash = '#/inst/bills'; }
        catch (er) { showErr(f, er); busy(f, false); }
      });
    }

    if (tab === 'bills') {
      const rows = await api('/inst/bills');
      paint(el, rows.length ? html`<div class="card scroll-x fade"><table class="table">
        <thead><tr><th>${t('control_number')}</th><th>${t('category')}</th><th class="r">${t('bill_amount')}</th><th>${t('paid_so_far')}</th><th>${t('status')}</th><th class="r">${t('actions')}</th></tr></thead>
        <tbody>${rows.map((b) => html`<tr>
          <td class="mono">${fmtCn(b.control_number)}<div class="small muted">${b.expires_on ? t('expires') + ' ' + fdate(b.expires_on) : ''}</div></td>
          <td>${cat(b.category)}</td>
          <td class="r num">${tzs(b.amount_tzs)}</td>
          <td><div class="bar"><i data-pct="${pct(b)}"></i></div><div class="small muted mono">${pct(b)}% · ${tzs(b.confirmed_tzs)}</div></td>
          <td>${statusTag(b.status)} ${b.pending ? html`<span class="tag warn">${b.pending} ${t('k_pending').toLowerCase()}</span>` : ''}</td>
          <td class="r">${b.status === 'open' ? html`<button class="btn sm ghost danger" type="button" data-act="close-bill" data-v="${b.id}">${t('close_bill')}</button>` : ''}</td>
        </tr>`)}</tbody></table></div>`
        : html`<div class="empty">${t('no_bills')}${verified ? html` <a href="#/inst/post">${t('post_btn')}</a>` : ''}</div>`);
    }

    if (tab === 'confirm') {
      const [pend, done] = await Promise.all([api('/inst/contributions?status=pending'), api('/inst/contributions?status=confirmed')]);
      paint(el, html`
        <div class="fade"><h3>${t('confirm_title')}</h3><p class="muted">${t('confirm_sub')}</p>
        ${pend.length ? html`<div class="stack sp-sm">${pend.map((c) => html`
          <div class="card" data-cid="${c.id}">
            <div class="row between">
              <div><div class="small muted">${t('receipt_ref')} · ${t('ch_' + c.channel)}</div><div class="code">${c.payment_ref}</div></div>
              <div class="small muted">${t('control_number')}<div class="mono">${fmtCn(c.control_number)}</div><div>${cat(c.category)} · ${fdate(c.created_at)}</div></div>
            </div>
            <div class="row sp-sm">
              <label class="field"><span>${t('received_amt')}</span><input class="input mono" name="amt" inputmode="numeric" value="${c.amount_tzs}"></label>
              <div class="row">
                <button class="btn primary" type="button" data-act="confirm" data-v="${c.id}">${t('confirm')}</button>
                <button class="btn ghost danger" type="button" data-act="reject" data-v="${c.id}">${t('reject')}</button>
              </div>
            </div>
          </div>`)}</div>` : html`<div class="empty sp-sm">${t('nothing_pending')}</div>`}
        ${done.length ? html`<div class="card sp-md"><h3>${t('history')}</h3><div class="list sp-sm">${done.slice(0, 30).map((c) => html`
          <div class="li"><div><span class="mono">${c.payment_ref}</span><div class="small muted">${fmtCn(c.control_number)} · ${fdate(c.reviewed_at)}</div></div>
            <span class="num">${tzs(c.amount_tzs)}</span></div>`)}</div></div>` : ''}
        </div>`);
    }
  };

  // ---------- Admin ----------
  // Admin section: Overview (numbers and charts) and Institutions (verification queue).
  const adminTabs = (cur, pending) => html`<nav class="tabs">
    <a href="#/admin" ${cur === 'overview' ? raw('aria-current="page"') : ''}>${t('ov_tab')}</a>
    <a href="#/admin/institutions" ${cur === 'institutions' ? raw('aria-current="page"') : ''}>${t('institutions')}${pending ? html`<span class="badge">${pending}</span>` : ''}</a></nav>`;

  // Grouped bar chart in SVG. series: [{ name, cls, values }]. One axis, recessive grid,
  // hover tooltip per column, legend for 2+ series, and a table view underneath.
  function niceMax(v) {
    if (v <= 0) return 4;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * p;
  }
  function barChart({ id, labels, series, fmt, title, integer }) {
    const W = 640, H = 220, L = 56, R = 8, T = 10, B = 28;
    const peak = Math.max(0, ...series.flatMap((x) => x.values));
    const step = integer ? Math.max(1, Math.ceil(peak / 4)) : niceMax(peak / 4);
    const max = step * 4;
    const pw = W - L - R, ph = H - T - B;
    const slot = pw / labels.length, gap = 2;
    const bw = Math.max(3, Math.min(28, (slot * 0.7 - gap * (series.length - 1)) / series.length));
    const y = (v) => T + ph - (v / max) * ph;
    const ticks = [0, 1, 2, 3, 4].map((k) => step * k);
    const every = labels.length > 8 ? 2 : 1;
    let svg = '';
    ticks.forEach((tv) => {
      svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(tv)}" y2="${y(tv)}"/>`;
      svg += `<text class="ax" x="${L - 8}" y="${y(tv) + 4}" text-anchor="end">${esc(fmt(tv, true))}</text>`;
    });
    labels.forEach((lab, i) => {
      const x0 = L + i * slot + (slot - (bw * series.length + gap * (series.length - 1))) / 2;
      series.forEach((sr, k) => {
        const v = sr.values[i]; const top = y(v); const h = T + ph - top;
        if (h > 0) {
          const x = x0 + k * (bw + gap); const r = Math.min(4, bw / 2, h);
          svg += `<path class="bar ${sr.cls}" d="M${x},${T + ph} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${T + ph} Z"/>`;
        }
      });
      if (i % every === 0 || i === labels.length - 1) svg += `<text class="ax" x="${L + i * slot + slot / 2}" y="${H - 8}" text-anchor="middle">${esc(lab)}</text>`;
      svg += `<rect class="hit" data-i="${i}" x="${L + i * slot}" y="${T}" width="${slot}" height="${ph}"/>`;
    });
    svg += `<line class="base" x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}"/>`;
    const legend = series.length > 1 ? html`<div class="legend">${series.map((sr) => html`<span><i class="sw ${sr.cls}"></i>${sr.name}</span>`)}</div>` : '';
    return html`<figure class="chart" id="${id}" data-chart="${JSON.stringify({ labels, series: series.map((sr) => ({ name: sr.name, cls: sr.cls, values: sr.values.map((v) => fmt(v)) })) })}">
      <figcaption class="label">${title}</figcaption>${legend}
      <div class="plot"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">${raw(svg)}</svg><div class="tip" hidden></div></div>
      <details class="sp-sm"><summary class="small muted">${t('ov_table')}</summary><div class="scroll-x"><table class="table"><thead><tr><th></th>${series.map((sr) => html`<th class="r">${sr.name}</th>`)}</tr></thead>
        <tbody>${labels.map((lab, i) => html`<tr><td>${lab}</td>${series.map((sr) => html`<td class="r num">${fmt(sr.values[i])}</td>`)}</tr>`)}</tbody></table></div></details>
    </figure>`;
  }
  function wireCharts(root) {
    $$('figure.chart', root).forEach((fig) => {
      const data = JSON.parse(fig.getAttribute('data-chart'));
      const tip = $('.tip', fig); const plot = $('.plot', fig);
      const show = (e) => {
        const r = e.target.closest('.hit'); if (!r) return;
        const i = Number(r.dataset.i);
        paint(tip, html`<b>${data.labels[i]}</b>${data.series.map((sr) => html`<span><i class="sw ${sr.cls}"></i>${sr.name}: <b class="num">${sr.values[i]}</b></span>`)}`);
        tip.hidden = false;
        const pr = plot.getBoundingClientRect(), hr = r.getBoundingClientRect();
        const left = Math.min(Math.max(hr.left - pr.left + hr.width / 2 - tip.offsetWidth / 2, 0), pr.width - tip.offsetWidth);
        tip.style.left = left + 'px';
        $$('.hit', fig).forEach((h) => h.classList.toggle('on', h === r));
      };
      plot.addEventListener('mousemove', show);
      plot.addEventListener('click', show);
      plot.addEventListener('mouseleave', () => { tip.hidden = true; $$('.hit', fig).forEach((h) => h.classList.remove('on')); });
    });
  }

  views.admin = async function (p, q) {
    if (!S.me || S.me.role !== 'admin') { location.hash = '#/login'; return; }
    if (p[0] !== 'institutions') return views.adminOverview();
    const st = ['pending', 'verified', 'rejected', 'suspended'].includes(q.status) ? q.status : 'pending';
    const r = await api('/admin/institutions?status=' + st);
    const label = { pending: 'st_pending_i', verified: 'st_verified', rejected: 'st_rejected_i', suspended: 'st_suspended' };
    paint(main, html`
      <div class="section-head fade page-head"><h2>${t('admin_dash')}</h2></div>
      ${adminTabs('institutions', r.counts.pending)}
      <div class="seg sp-sm">${Object.keys(label).map((k) => html`<a href="#/admin/institutions?status=${k}" aria-current="${k === st}">${t(label[k])}${r.counts[k] ? ' · ' + r.counts[k] : ''}</a>`)}</div>
      <div class="sp-md"></div>
      ${r.items.length ? html`<div class="stack">${r.items.map((i) => html`
        <div class="card" data-iid="${i.id}">
          <div class="row between"><div><h3>${i.name}</h3><div class="small muted">${t(i.kind === 'health' ? 'health' : 'school')} · ${lvl(i.level)} · ${own(i.ownership)} · ${i.district}, ${i.region}</div></div>
            <span class="code">${i.reg_no}</span></div>
          <dl class="kv sp-sm"><dt>${t('sec_contact')}</dt><dd>${i.contact_name}${i.contact_title ? ', ' + i.contact_title : ''}</dd>
            <dt>${t('phone')}</dt><dd class="mono">${i.phone}</dd><dt>${t('email')}</dt><dd>${i.email}</dd>
            <dt>${t('registered')}</dt><dd>${fdate(i.created_at)}</dd>
            ${i.review_note ? html`<dt>${t('reason')}</dt><dd>${i.review_note}</dd>` : ''}</dl>
          <div class="row sp-sm">
            <input class="input" name="note" placeholder="${t('reason')}" aria-label="${t('reason')}">
            <div class="row">
              ${st !== 'verified' ? html`<button class="btn primary" type="button" data-act="admin" data-op="verify" data-v="${i.id}">${t('verify')}</button>` : ''}
              ${st === 'pending' ? html`<button class="btn ghost danger" type="button" data-act="admin" data-op="reject" data-v="${i.id}">${t('reject')}</button>` : ''}
              ${st === 'verified' ? html`<button class="btn ghost danger" type="button" data-act="admin" data-op="suspend" data-v="${i.id}">${t('suspend')}</button>` : ''}
            </div>
          </div>
        </div>`)}</div>` : html`<div class="empty">${t('nothing_here')}</div>`}`);
  };

  views.adminOverview = async function () {
    paint(main, html`<div class="page-head"><h2>${t('admin_dash')}</h2></div>${adminTabs('overview', 0)}${raw('<div class="skel"></div>')}`);
    const o = await api('/admin/overview');
    const d = o.donors, ib = o.institutions.by_status, b = o.bills, m = o.money;
    const tile = (k, v, opts) => html`<div class="ov-tile ${opts && opts.cls ? opts.cls : ''}"><span class="label">${t(k)}</span><span class="v num">${v}</span>${opts && opts.sub ? html`<span class="small muted">${opts.sub}</span>` : ''}</div>`;
    const pctOf = (a, total) => total ? Math.round((a / total) * 100) + '%' : '0%';
    const monthLabel = (ym) => { try { return new Date(ym + '-01T00:00:00').toLocaleDateString(locale(), { month: 'short' }); } catch (e) { return ym; } };
    const weekLabel = (iso) => { try { return new Date(iso + 'T00:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short' }); } catch (e) { return iso; } };
    const short = (v, axis) => {
      if (!axis) return tzs(v);
      if (v >= 1e6) return (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + 'M';
      if (v >= 1e3) return Math.round(v / 1e3) + 'k';
      return String(Math.round(v));
    };
    const maxRegion = Math.max(1, ...o.institutions.by_region.map((r) => Number(r.received_tzs)));
    paint(main, html`
      <div class="page-head"><h2>${t('admin_dash')}</h2></div>
      ${adminTabs('overview', ib.pending)}

      <section class="ov-sec fade">
        <h3>${t('ov_donors')}</h3>
        <div class="ov-grid c6">
          ${tile('ov_total', num(d.total), { sub: html`${num(d.new_30d)} ${t('ov_new30')}` })}
          ${tile('individuals', num(d.individual), { sub: pctOf(d.individual, d.total) })}
          ${tile('organisations', num(d.organisation), { sub: pctOf(d.organisation, d.total) })}
          ${tile('ov_active', num(d.active_30d), { cls: 'good', sub: t('ov_active_sub') })}
          ${tile('ov_dormant', num(d.dormant_90d), { cls: 'warn', sub: t('ov_dormant_sub') })}
          ${tile('ov_never', num(d.never_gave), { sub: t('ov_never_sub') })}
        </div>
      </section>

      <section class="ov-sec">
        <h3>${t('institutions')}</h3>
        <div class="ov-grid c4">
          <a class="ov-tile warn link" href="#/admin/institutions?status=pending"><span class="label">${t('st_pending_i')}</span><span class="v num">${num(ib.pending)}</span><span class="small muted">${t('ov_review')} →</span></a>
          ${tile('st_verified', num(ib.verified), { sub: html`${num(o.institutions.verified_by_kind.health)} ${t('health').toLowerCase()} · ${num(o.institutions.verified_by_kind.school)} ${t('school').toLowerCase()}` })}
          ${tile('st_rejected_i', num(ib.rejected))}
          ${tile('st_suspended', num(ib.suspended))}
        </div>
        ${o.institutions.by_region.length ? html`<div class="card flat sp-sm scroll-x"><table class="table ov-regions">
          <thead><tr><th>${t('region')}</th><th class="r">${t('st_verified')}</th><th class="r">${t('st_pending_i')}</th><th>${t('k_received')}</th></tr></thead>
          <tbody>${o.institutions.by_region.map((r) => html`<tr><td>${r.region}</td><td class="r num">${num(r.verified)}</td><td class="r num">${num(r.pending)}</td>
            <td><div class="ov-bar"><i data-pct="${Math.round((Number(r.received_tzs) / maxRegion) * 100)}"></i></div><span class="num small">${tzs(r.received_tzs)}</span></td></tr>`)}</tbody></table></div>` : ''}
      </section>

      <section class="ov-sec">
        <h3>${t('ov_bills_money')}</h3>
        <div class="ov-grid c6">
          ${tile('k_open', num(b.open), { sub: html`${tzs(b.open_remaining_tzs)} ${t('remaining')}` })}
          ${tile('k_cleared', num(b.cleared))}
          ${tile('closed', num(b.closed))}
          ${tile('k_pending', num(b.payments_to_confirm), { cls: b.payments_to_confirm ? 'warn' : '' })}
          ${tile('st_total', tzs(m.total_tzs), { cls: 'good', sub: html`${num(m.gifts)} ${t('gifts')}` })}
          ${tile('this_month', tzs(m.this_month_tzs))}
        </div>
        <div class="ov-charts sp-md">
          ${barChart({ id: 'ch-money', title: t('ov_money_month'), labels: m.by_month.map((r) => monthLabel(r.month)),
                       series: [{ name: t('k_received'), cls: 's-money', values: m.by_month.map((r) => Number(r.tzs)) }], fmt: short })}
          ${barChart({ id: 'ch-signups', title: t('ov_signups'), labels: o.signups.map((r) => weekLabel(r.week)),
                       series: [{ name: t('givers'), cls: 's-donors', values: o.signups.map((r) => r.donors) },
                                { name: t('institutions'), cls: 's-inst', values: o.signups.map((r) => r.institutions) }],
                       fmt: (v) => num(Math.round(v)), integer: true })}
        </div>
      </section>`);
    wireCharts(main);
  };

  // ---------- Global click actions ----------
  document.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'copy') return copy(a.dataset.v);
    if (act === 'logout') { setToken(null); location.hash = '#/'; return route(); }
    if (act === 'close-bill') {
      if (!confirm(t('close_confirm'))) return;
      try { await api('/inst/bills/' + a.dataset.v + '/close', { body: {} }); route(); } catch (er) { toast(errMsg(er)); }
    }
    if (act === 'confirm' || act === 'reject') {
      if (act === 'reject' && !confirm(t('reject_confirm'))) return;
      const card = a.closest('[data-cid]');
      const amt = parseInt(String($('[name=amt]', card).value).replace(/[^\d]/g, ''), 10);
      a.disabled = true;
      try {
        await api('/inst/contributions/' + a.dataset.v + '/' + act, { body: act === 'confirm' ? { amount: amt } : {} });
        toast(t(act === 'confirm' ? 'confirmed_ok' : 'rejected_ok')); route();
      } catch (er) { toast(errMsg(er)); a.disabled = false; }
    }
    if (act === 'admin') {
      const card = a.closest('[data-iid]');
      a.disabled = true;
      try { await api('/admin/institutions/' + a.dataset.v + '/' + a.dataset.op, { body: { note: $('[name=note]', card).value.trim() } }); route(); }
      catch (er) { toast(errMsg(er)); a.disabled = false; }
    }
  });

  $('#lang').addEventListener('click', () => { S.lang = S.lang === 'sw' ? 'en' : 'sw'; store.set('tk_lang', S.lang); route(); });
  function applyTheme(th) {
    if (th) document.documentElement.setAttribute('data-theme', th); else document.documentElement.removeAttribute('data-theme');
    const dark = th === 'dark';
    const tc = $('meta[name=theme-color]');
    if (tc) tc.setAttribute('content', dark ? '#0A0F1C' : '#FFFFFF');
  }
  $('#theme').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    store.set('tk_theme', next); applyTheme(next);
  });
  $('#menu').addEventListener('click', () => {
    const open = $('#nav').classList.toggle('open');
    $('#menu').setAttribute('aria-expanded', String(open));
  });

  // ---------- Router ----------
  const routes = [
    [/^\/?$/, views.home],
    [/^\/live$/, views.live],
    [/^\/bills$/, views.bills],
    [/^\/bill\/(\d+)$/, views.bill],
    [/^\/i\/(\d+)$/, views.institution],
    [/^\/board$/, views.board],
    [/^\/track(?:\/([\w-]+))?$/, views.track],
    [/^\/about$/, views.about],
    [/^\/login$/, views.login],
    [/^\/join$/, views.join],
    [/^\/forgot$/, views.forgot],
    [/^\/reset\/([\w-]+)$/, views.reset],
    [/^\/privacy$/, views.privacy],
    [/^\/join\/donor$/, views.joinDonor],
    [/^\/join\/institution$/, views.joinInst],
    [/^\/me$/, views.me],
    [/^\/inst(?:\/(\w+))?$/, views.inst],
    [/^\/admin(?:\/(\w+))?$/, views.admin]
  ];
  let seq = 0;
  async function route() {
    const my = ++seq;
    const h = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = h.split('?');
    const q = Object.fromEntries(new URLSearchParams(qs || ''));
    if (S.token && !S.me) await loadMe();
    if (my !== seq) return;
    stopLive();
    clearInterval(rotTimer);
    shell(path);
    for (const [re, fn] of routes) {
      const mt = path.match(re);
      if (mt) {
        try { await fn(mt.slice(1).filter((x) => x != null), q); }
        catch (e) { if (my === seq) paint(main, html`<div class="empty">${errMsg(e)}</div>`); }
        if (my === seq && !h.includes('?')) window.scrollTo(0, 0);
        return;
      }
    }
    paint(main, html`<div class="empty">${t('not_found')} <a href="#/">msaada tutani</a></div>`);
  }
  // Filter changes on the bills page rewrite the query with replaceState, which fires no
  // hashchange; a real navigation always re-renders.
  window.addEventListener('hashchange', route);

  applyTheme(store.get('tk_theme') || 'dark');
  route();
})();

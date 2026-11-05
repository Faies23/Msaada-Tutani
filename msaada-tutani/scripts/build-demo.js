// Builds a single self-contained HTML demo of the site: the real front end plus demo/mock.js,
// which answers /api calls in the browser with sample data. Usage: node scripts/build-demo.js out.html
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const out = process.argv[2] || path.join(root, 'demo', 'msaada-tutani-demo.html');

const index = read('public/index.html');
const body = index.slice(index.indexOf('<body>') + 6, index.indexOf('<script src="/i18n.js">')).replace('<a class="skip" href="#main">Skip to content</a>', '');
// The starter catalogue goes into the demo so the registration type-ahead works offline.
const { parseCsv, toRecord } = require('../src/catalogue');
const catRows = parseCsv(read('db/catalogue/starter.csv'));
const catHead = catRows.shift();
const catalogue = catRows.map((r) => toRecord(Object.fromEntries(catHead.map((h, i) => [h, r[i]])))).filter(Boolean);
// The demo is one file, so the self-hosted font is embedded as a data URI.
const inlineFonts = (css) => css.replace(/url\("\/fonts\/([\w.-]+\.woff2)"\)/g, (m, f) =>
  'url("data:font/woff2;base64,' + fs.readFileSync(path.join(root, 'public', 'fonts', f)).toString('base64') + '")');
// Inline scripts must not contain a literal closing script tag.
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

const demoCss = `
.top { top: env(safe-area-inset-top, 0px); }
.demo-bar { background: var(--panel); color: var(--text-2); font: 13px/1.5 var(--font); border-bottom: 1px solid var(--line); }
.demo-bar .wrap { display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: center; padding-block: 9px; }
.demo-bar b { font-weight: 700; text-transform: uppercase; font-size: 11px; background: var(--amber); color: var(--on-amber); padding: 2px 7px; border-radius: 4px; }
.demo-bar code { font-family: var(--font); font-weight: 700; font-size: 13px; color: var(--text); }
`;

const html = `<title>Msaada Tutani</title>
<meta name="description" content="Verified Tanzanian hospitals and schools post unpaid bills by control number. Anyone can clear them, anonymously.">
<style>
${inlineFonts(read('public/styles.css'))}
${demoCss}
</style>
<div class="demo-bar"><div class="wrap">
  <b>Demo</b>
  <span>Sample data. Changes reset when you reload.</span>
  <span>Try signing in (password <code>demo1234</code>): giver <code>donor1@demo.tz</code> · hospital <code>inst1@demo.tz</code> · admin <code>admin@demo.tz</code></span>
</div></div>
${body}
<script>
// Inside the preview frame, browser confirm dialogs are disabled; the demo treats them as "yes".
window.confirm = function () { return true; };
${safe(read('public/i18n.js'))}
window.MT_CATALOGUE = ${safe(JSON.stringify(catalogue))};
${safe(read('demo/mock.js'))}
${safe(read('public/app.js'))}
</script>
`;
fs.writeFileSync(out, html);
console.log('Wrote', out, Math.round(html.length / 1024) + ' KB');

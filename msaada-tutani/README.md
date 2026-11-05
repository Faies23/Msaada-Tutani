# Msaada Tutani

**Sadaka yenye kuishi · The living charity.** www.msaadatutani.com

Verified Tanzanian hospitals, schools, colleges and universities list bills that families could not pay, each with its **control number**. Anyone can pay any part of a bill directly to the institution with M-Pesa, Mixx by Yas, Airtel Money, HaloPesa, AzamPesa or a bank. **The money never passes through Msaada Tutani.** The institution confirms each payment against its own GePG or bank records, and the bill updates on a live board.

Node.js (Express) + PostgreSQL. No-build front end in Kiswahili and English, bright and night themes, Inter font served from the site.

## What it does

| Who | What they do |
|---|---|
| **Donor: individual** | Public alias, optional private name, email, optional phone and region. Gives anonymously, earns 1 point per TSh 1,000 confirmed. |
| **Donor: organisation** | Company, NGO, church or mosque, or a group of friends/colleagues: organisation name, type, optional registration/TIN, contact person, name shown on the leaderboard. |
| **Institution** | Searches its name in the catalogue (type-ahead fills region, district, level, ownership) or chooses "Not on the list" and types its details. Adds its registration number and contact person. After admin verification it posts bills and confirms payments. |
| **Admin** | Verifies, rejects or suspends institutions. |

Also: a live board that updates every few seconds, a ticker tape, leaderboards (individuals, organisations, institutions, regions), payment tracking codes, a reminder to check the institution's name on the phone before entering the PIN, bilingual email notifications, password reset by email, and a privacy page.

## Launch checklist

### 1. Code on GitHub
Upload this project to `github.com/Faies23/Msaada-Tutani` (drag the unzipped files into **Add file > Upload files**).

### 2. Database (Supabase, free to start)
1. supabase.com > **New project**. Pick a strong database password.
2. **Project Settings > Database > Connection string > URI**, using the **Session pooler**. Copy it and put your password in it. This is `DATABASE_URL`.

### 3. Website (Render)
1. render.com > **New > Blueprint** > choose the **Msaada-Tutani** repository. Render reads `render.yaml`.
2. Fill in when asked: `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and the email settings (step 5). `JWT_SECRET` is generated for you.
3. Deploy. On every start the app creates any missing tables, the admin account and the starter catalogue. Check `https://<service>.onrender.com/health`.

### 4. Domain: www.msaadatutani.com
1. Buy `msaadatutani.com` from any registrar (Cloudflare, Namecheap, GoDaddy). A `.co.tz` can be added later through a TCRA-accredited registrar.
2. Render > the service > **Settings > Custom Domains**: add `www.msaadatutani.com` and `msaadatutani.com`.
3. At the registrar, add the DNS records Render shows (normally a **CNAME** for `www` pointing to `<service>.onrender.com`, and an **A** record for the bare domain). Render issues the HTTPS certificate automatically.
4. Visitors to `msaadatutani.com` are redirected to `www.msaadatutani.com` (set by `CANONICAL_HOST`).

### 5. Email
Use any SMTP provider. Zoho Mail (mailbox on your domain) or Brevo (free sending tier) both work. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`. Add the SPF/DKIM records your provider gives you at the registrar so emails do not land in spam. Also create `privacy@msaadatutani.com`, which the privacy page mentions.

### 6. First day
1. Sign in at `/#/login` with the admin email and password. Change the password through **Forgot password?** if you used a temporary one.
2. Invite 2 or 3 hospitals or schools you know. Verify them under **Admin** after checking their registration numbers.
3. Do **not** run `npm run seed` on the live database. It adds demo data.

## Institution catalogue

`db/catalogue/starter.csv` holds 106 well-known institutions: the national, zonal and regional referral hospitals, universities and colleges, and leading national secondary schools. It has names, levels, ownership, regions and districts, with no registration numbers, because those must come from official sources.

Load the complete official lists when you get them (Ministry of Health Health Facility Registry export, NECTA school lists, TCU and NACTVET lists):

```bash
npm run catalogue:import -- hfr-facilities.csv hfr
npm run catalogue:import -- necta-secondary.csv necta
```

Columns are matched by name. Accepted headers include `name / facility_name / school_name`, `level / facility_type / type`, `ownership / owner`, `region`, `district / council`, `reg_no / hfr_code / registration_number`. Wording such as "Health Center", "Hospital", "Public" or "Faith Based Organization" is understood. Re-importing updates existing rows instead of duplicating them.

## Run locally

```bash
npm install
cp .env.example .env      # set DATABASE_URL and the admin login
npm run migrate           # tables, admin, starter catalogue (safe to re-run)
npm run seed              # OPTIONAL demo data, never on the live site
npm start                 # http://localhost:8080
npm run demo -- out.html  # single-file clickable demo with sample data
```

Without `SMTP_HOST`, emails are printed to the console.

## Layout

```
db/schema.sql                 tables (safe to re-run)
db/catalogue/starter.csv      starter list of institutions
src/server.js                 app, security headers, www redirect
src/catalogue.js              CSV import for the catalogue
src/mail.js                   bilingual emails
src/routes/                   auth, public (bills, live board, catalogue, leaderboards), institution, donor, admin
public/                       index.html, styles.css, app.js, i18n.js (SW/EN), fonts/ (Inter, SIL OFL)
demo/mock.js                  in-browser sample backend for the demo build
render.yaml                   Render blueprint
```

## Before and after launch (not legal advice)

- **PDPC**: register Macros Group Ltd as a data controller under the Personal Data Protection Act, 2022. Hosting outside Tanzania is a cross-border transfer that needs PDPC approval.
- **Company and NGO law**: run it as a technology service of Macros Group Ltd that never receives or holds donations. Get a short written opinion from a Tanzanian advocate on whether a separate NGO is needed.
- **Bank of Tanzania**: not needed while donors pay institutions directly. Taking payments into your own account would change that.
- **Swahili copy**: have a native speaker read `public/i18n.js`.
- **Payment menus**: check that each network's menu wording matches the steps on the bill page.
- **Statistics on the home page** come from the cited sources. Update them when newer figures are published.

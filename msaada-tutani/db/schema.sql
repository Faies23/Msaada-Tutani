-- Msaada Tutani schema. Safe to run more than once.

create table if not exists users (
  id             bigserial primary key,
  role           text not null check (role in ('donor', 'institution', 'admin')),
  email          text not null unique,
  phone          text,
  password_hash  text not null,
  -- The only name a donor is ever shown under. Never their email or phone.
  alias          text,
  hide_from_board boolean not null default false,
  created_at     timestamptz not null default now()
);

create table if not exists institutions (
  id            bigserial primary key,
  user_id       bigint not null unique references users(id) on delete cascade,
  name          text not null,
  kind          text not null check (kind in ('health', 'school')),
  -- Health: facility registration / HFR code. School: registration number (e.g. S.1234, EM.5678).
  reg_no        text not null,
  region        text not null,
  district      text not null,
  ownership     text not null check (ownership in ('government', 'private', 'faith')),
  level         text not null check (level in (
                  'dispensary', 'health_centre', 'district_hospital', 'regional_referral',
                  'zonal_referral', 'national_hospital',
                  'primary', 'secondary', 'college')),
  contact_name  text not null,
  contact_title text,
  phone         text not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'verified', 'rejected', 'suspended')),
  review_note   text,
  verified_at   timestamptz,
  created_at    timestamptz not null default now()
);
-- One account per registration number, per sector.
create unique index if not exists institutions_reg_uq on institutions (kind, upper(reg_no));
create index if not exists institutions_status_idx on institutions (status);

create table if not exists bills (
  id               bigserial primary key,
  institution_id   bigint not null references institutions(id) on delete cascade,
  control_number   text not null,
  -- How the control number is paid: the government gateway, a bank, or a merchant Lipa number.
  pay_via          text not null default 'gepg' check (pay_via in ('gepg', 'bank', 'lipa')),
  pay_via_detail   text,
  amount_tzs       bigint not null check (amount_tzs > 0),
  confirmed_tzs    bigint not null default 0 check (confirmed_tzs >= 0),
  category         text not null,
  -- Public description. Institutions are told never to include names or identifying details.
  note             text,
  partial_allowed  boolean not null default true,
  expires_on       date,
  status           text not null default 'open' check (status in ('open', 'cleared', 'closed')),
  created_at       timestamptz not null default now(),
  cleared_at       timestamptz
);
-- A control number can only be live once per institution.
create unique index if not exists bills_open_cn_uq on bills (institution_id, control_number) where status = 'open';
create index if not exists bills_status_idx on bills (status, created_at desc);

create table if not exists contributions (
  id             bigserial primary key,
  bill_id        bigint not null references bills(id) on delete cascade,
  -- Null when the giver did not sign in: fully anonymous, no points.
  donor_id       bigint references users(id) on delete set null,
  amount_tzs     bigint not null check (amount_tzs > 0),
  -- The reference on the mobile-money / bank receipt. Seen only by the institution, to match.
  payment_ref    text not null,
  channel        text not null,
  status         text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  -- Code the giver keeps to check on their payment without an account.
  tracking_code  text not null unique,
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz
);
create unique index if not exists contributions_ref_uq on contributions (bill_id, upper(payment_ref));
create index if not exists contributions_bill_idx on contributions (bill_id, status);
create index if not exists contributions_donor_idx on contributions (donor_id, status);

-- Optional email a giver without an account leaves to get updates on their payment.
-- Never shown to the institution.
alter table contributions add column if not exists notify_email text;

-- ---------- Launch additions ----------

-- Donors can be individuals or organisations (companies, NGOs, religious groups, groups of friends).
alter table users add column if not exists donor_type text not null default 'individual';
alter table users add column if not exists full_name text;
alter table users add column if not exists org_name text;
alter table users add column if not exists org_type text;
alter table users add column if not exists org_reg_no text;
alter table users add column if not exists region text;

-- Catalogue of known Tanzanian institutions, used for the type-ahead on registration.
-- Starts with a starter list and grows by importing official lists (see scripts/import-catalogue.js).
create table if not exists catalogue (
  id         bigserial primary key,
  name       text not null,
  kind       text not null check (kind in ('health', 'school')),
  level      text not null,
  ownership  text,
  region     text,
  district   text,
  reg_no     text,
  source     text not null default 'starter'
);
create unique index if not exists catalogue_name_uq on catalogue (kind, lower(name), coalesce(region, ''));
create index if not exists catalogue_name_idx on catalogue (lower(name) text_pattern_ops);
alter table institutions add column if not exists catalogue_id bigint references catalogue(id) on delete set null;

-- Password reset links. Only a hash of the token is stored.
create table if not exists password_resets (
  token_hash  text primary key,
  user_id     bigint not null references users(id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create unique index if not exists institutions_catalogue_uq on institutions (catalogue_id) where catalogue_id is not null;

-- When each account last signed in, so the admin overview can tell active from dormant accounts.
alter table users add column if not exists last_login_at timestamptz;

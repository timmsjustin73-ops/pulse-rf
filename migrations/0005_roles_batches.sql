create table if not exists platform_admins (
  user_id text primary key
);

create table if not exists request_batches (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  zone_id text references zones (id) on delete set null,
  created_by text not null,
  title text not null,
  status text not null default 'submitted',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists request_batches_event_idx on request_batches (event_id);

alter table requests add column if not exists batch_id text references request_batches (id) on delete set null;
alter table requests add column if not exists tuned_at timestamptz;
alter table requests add column if not exists tuned_by text;

create table if not exists notifications (
  id text primary key,
  user_id text not null,
  event_id text,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

create table if not exists companies (
  id text primary key,
  name text not null unique
);

create table if not exists company_members (
  company_id text not null references companies (id) on delete cascade,
  user_id text not null,
  primary key (company_id, user_id)
);

create index if not exists company_members_user_idx on company_members (user_id);

alter table requests add column if not exists spare boolean not null default false;

alter table requests add column if not exists power_mw double precision not null default 10;
alter table requests add column if not exists flag_reason text;

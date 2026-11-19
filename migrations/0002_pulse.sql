-- Pulse RF coordination data. Per-user rows are scoped in server functions.

create table if not exists events (
  id text primary key,
  owner_id text not null,
  name text not null,
  venue text not null default '',
  city text not null default '',
  region text not null default 'AU',
  starts_on text not null default '',
  ends_on text not null default '',
  spacing text not null default 'balanced',
  notes text not null default '',
  join_code text not null unique,
  join_role text not null default 'contributor',
  blockers text not null default '[]',
  created_at timestamptz not null default now()
);

create index if not exists events_owner_idx on events (owner_id);

create table if not exists event_members (
  event_id text not null references events (id) on delete cascade,
  user_id text not null,
  role text not null,
  primary key (event_id, user_id)
);

create index if not exists event_members_user_idx on event_members (user_id);

create table if not exists zones (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  name text not null,
  isolated boolean not null default false
);

create index if not exists zones_event_idx on zones (event_id);

create table if not exists requests (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  zone_id text references zones (id) on delete set null,
  created_by text not null,
  category text not null,
  label text not null,
  device_key text not null,
  device_name text not null,
  manufacturer text not null default '',
  band_min double precision not null,
  band_max double precision not null,
  bandwidth double precision not null,
  mode text not null,
  priority text not null default 'normal',
  time_start text,
  time_end text,
  notes text not null default '',
  locked boolean not null default false,
  assigned_mhz double precision,
  created_at timestamptz not null default now()
);

create index if not exists requests_event_idx on requests (event_id);

create table if not exists scans (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  label text not null,
  body text not null,
  threshold double precision not null default -70,
  created_at timestamptz not null default now()
);

create index if not exists scans_event_idx on scans (event_id);

create table if not exists custom_devices (
  id text primary key,
  user_id text not null,
  category text not null,
  manufacturer text not null default '',
  name text not null,
  band_min double precision not null,
  band_max double precision not null,
  bandwidth double precision not null,
  mode text not null,
  power text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists custom_devices_user_idx on custom_devices (user_id);

create table if not exists activity (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  user_id text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists activity_event_idx on activity (event_id, created_at desc);

create table if not exists area_groups (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  name text not null
);

create table if not exists area_group_zones (
  group_id text not null references area_groups (id) on delete cascade,
  zone_id text not null references zones (id) on delete cascade,
  primary key (group_id, zone_id)
);

create table if not exists holds (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  zone_id text references zones (id) on delete set null,
  mhz double precision not null,
  label text not null default 'Hold',
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists line_history (
  id text primary key,
  request_id text not null,
  event_id text not null,
  user_id text not null,
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists line_history_request_idx on line_history (request_id, created_at desc);

create table if not exists presence (
  event_id text not null,
  user_id text not null,
  name text not null default '',
  last_seen timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table events add column if not exists plot_locked boolean not null default false;
alter table requests add column if not exists flag_reason text;
alter table requests add column if not exists flagged_mhz double precision;
alter table requests add column if not exists walkup boolean not null default false;
alter table request_batches add column if not exists time_start text;
alter table request_batches add column if not exists time_end text;
alter table request_batches add column if not exists day_label text;
alter table request_batches add column if not exists priority text not null default 'normal';
alter table request_batches add column if not exists return_note text not null default '';

alter table presence add column if not exists editing text not null default '';

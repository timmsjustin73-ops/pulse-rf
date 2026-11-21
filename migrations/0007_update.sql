alter table requests add column if not exists preferred_mhz double precision;
alter table requests add column if not exists review_status text not null default 'waiting';
alter table requests add column if not exists review_note text not null default '';
alter table requests add column if not exists private_note text not null default '';
alter table company_members add column if not exists owner boolean not null default false;
create table if not exists watched (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  mhz double precision not null,
  label text not null default 'Watch'
);
create table if not exists templates (
  id text primary key,
  owner_id text not null,
  name text not null,
  body jsonb not null
);
create table if not exists guest_codes (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  code text not null,
  expires_on text not null
);

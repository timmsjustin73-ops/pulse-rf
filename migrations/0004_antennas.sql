create table if not exists antennas (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  name text not null,
  power_mw double precision not null default 50,
  gain_dbi double precision not null default 2,
  freq_mhz double precision not null default 550,
  height_m double precision not null default 3,
  threshold_dbm double precision not null default -90,
  margin_db double precision not null default 10
);

create index if not exists antennas_event_idx on antennas (event_id);

-- Public share tokens and assignment undo snapshots.

alter table events add column if not exists share_token text;
create unique index if not exists events_share_token_idx on events (share_token) where share_token is not null;

create table if not exists assignment_snapshots (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  payload text not null,
  created_at timestamptz not null default now()
);

create index if not exists snapshots_event_idx on assignment_snapshots (event_id, created_at desc);

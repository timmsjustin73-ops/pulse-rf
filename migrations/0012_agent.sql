alter table "user" add column if not exists agent_enabled boolean not null default false;
update "user" set agent_enabled = true where email = 'justin@jtlive.tech';

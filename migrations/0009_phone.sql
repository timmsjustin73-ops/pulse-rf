alter table "user" add column if not exists phone text not null default '';
alter table "user" add column if not exists notify_email boolean not null default true;
alter table "user" add column if not exists notify_whatsapp boolean not null default false;

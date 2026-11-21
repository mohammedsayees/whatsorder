
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, role text, aud text,
  created_at timestamptz, updated_at timestamptz, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key, bucket_id text, name text, owner uuid);
create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1, '/') $$;
create publication supabase_realtime;
-- Minimal Supabase Realtime stand-in for Broadcast-from-database.
-- realtime.send mirrors production: it never raises (warnings only).
create schema realtime;
create table realtime.messages (id uuid primary key default gen_random_uuid(),
  topic text not null, extension text not null, payload jsonb, event text,
  private boolean default false, inserted_at timestamptz not null default now());
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as
  $$ select nullif(current_setting('realtime.topic', true), '')::text $$;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language plpgsql as $$
declare generated_id uuid; final_payload jsonb;
begin
  begin
    generated_id := gen_random_uuid();
    final_payload := case when payload ? 'id' then payload
      else jsonb_set(payload, '{id}', to_jsonb(generated_id)) end;
    execute format('SET LOCAL realtime.topic TO %L', topic);
    insert into realtime.messages (id, payload, event, topic, private, extension)
    values (generated_id, final_payload, event, topic, private, 'broadcast');
  exception when others then
    raise warning 'WarnSendingBroadcastMessage: %', sqlerrm;
  end;
end $$;

grant usage on schema public,auth,storage,realtime to anon,authenticated,service_role;
grant select on realtime.messages to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
create extension if not exists pgtap;

-- Run once in a dedicated Supabase project. Only service_role can call these RPCs.
create schema if not exists amp_private;
revoke all on schema amp_private from public, anon, authenticated;
create table if not exists amp_private.api_keys (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  prefix text not null,
  name text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days',
  revoked_at timestamptz
);
create table if not exists amp_private.buckets (
  id text primary key,
  count bigint not null default 0,
  cost bigint not null default 0,
  expires_at timestamptz not null
);
create table if not exists amp_private.leases (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  origin text not null,
  month_bucket text not null,
  expires_at timestamptz not null default now() + interval '70 seconds'
);
create table if not exists amp_private.control (
  id boolean primary key default true check(id),
  paused boolean not null default false
);
insert into amp_private.control(id) values(true) on conflict do nothing;
alter table amp_private.api_keys enable row level security;
alter table amp_private.buckets enable row level security;
alter table amp_private.leases enable row level security;
alter table amp_private.control enable row level security;
create index if not exists amp_buckets_expiry on amp_private.buckets(expires_at);
create index if not exists amp_keys_owner on amp_private.api_keys(owner,created_at);

create or replace function public.amp_rate(p_bucket text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = pg_catalog, amp_private as $$
declare k text; n bigint;
begin
  k := p_bucket || ':' || floor(extract(epoch from now()) / p_seconds)::text;
  insert into buckets(id, expires_at) values(k, now() + make_interval(secs => p_seconds * 2))
    on conflict do nothing;
  update buckets set count = count + 1 where id = k and count < p_limit returning count into n;
  return n is not null;
end $$;

create or replace function public.amp_keys(p_action text, p_owner uuid, p_hash text default null,
  p_prefix text default null, p_name text default null, p_id uuid default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, amp_private as $$
declare result jsonb; n integer; key_id uuid; month_key text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 0));
  if p_action = 'create' then
    select count(*) into n from api_keys where owner = p_owner and revoked_at is null and expires_at > now();
    if n >= 3 then return jsonb_build_object('error','key_limit','status',429); end if;
    if not public.amp_rate('key-create:' || p_owner, 10, 86400) then
      return jsonb_build_object('error','key_creation_limit','status',429);
    end if;
    if p_hash !~ '^[a-f0-9]{64}$' or length(p_name) not between 1 and 60 then
      raise exception 'Invalid key metadata';
    end if;
    insert into api_keys(owner,token_hash,prefix,name) values(p_owner,p_hash,p_prefix,p_name) returning id into key_id;
    return jsonb_build_object('id',key_id);
  elsif p_action = 'revoke' then
    update api_keys set revoked_at = now() where id = p_id and owner = p_owner and revoked_at is null;
  elsif p_action <> 'list' then raise exception 'Invalid action';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'prefix',prefix,
    'created_at',created_at,'expires_at',expires_at,'revoked_at',revoked_at) order by created_at desc),'[]'::jsonb)
    into result from api_keys where owner = p_owner and created_at > now() - interval '120 days';
  month_key := 'user:' || p_owner || ':' || to_char(now() at time zone 'UTC','YYYY-MM');
  return jsonb_build_object('keys',result,'used',coalesce((select count from buckets where id = month_key),0),'limit',10000);
end $$;

create or replace function public.amp_reserve(p_key_hash text, p_subject text, p_origin text, p_demo boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog, amp_private as $$
declare subject_key text; owner_id uuid; month_key text; user_key text; day_key text;
  global_row buckets%rowtype; user_count bigint; active_count integer; lease_id uuid; quota integer;
begin
  -- Serialize reservations across ALL instances: rotating keys/accounts cannot bypass the shared budget.
  perform pg_advisory_xact_lock(81294001);
  if (select paused from control where id = true) then
    return jsonb_build_object('error','api_paused','status',503); end if;
  delete from leases where expires_at < now();
  delete from buckets where expires_at < now();
  delete from api_keys where revoked_at < now() - interval '30 days' or expires_at < now() - interval '30 days';
  if p_demo then
    if p_subject is null or p_subject !~ '^demo:[a-f0-9]{64}$' then
      return jsonb_build_object('error','unauthorized','status',401); end if;
    subject_key := p_subject; quota := 3;
    user_key := subject_key || ':' || to_char(now() at time zone 'UTC','YYYY-MM-DD');
  else
    select owner into owner_id from api_keys where token_hash = p_key_hash
      and revoked_at is null and expires_at > now();
    if owner_id is null then return jsonb_build_object('error','invalid_api_key','status',401); end if;
    -- A deleted, banned or unverified auth account cannot keep using issued keys.
    if not exists(select 1 from auth.users where id = owner_id and email_confirmed_at is not null
      and (banned_until is null or banned_until < now())) then
      return jsonb_build_object('error','account_unavailable','status',403); end if;
    subject_key := 'user:' || owner_id; quota := 10000;
    user_key := subject_key || ':' || to_char(now() at time zone 'UTC','YYYY-MM');
  end if;
  month_key := 'global:' || to_char(now() at time zone 'UTC','YYYY-MM');
  insert into buckets(id,expires_at) values(month_key, now() + interval '40 days'),(user_key,now()+interval '40 days')
    on conflict do nothing;
  select * into global_row from buckets where id = month_key;
  if global_row.count >= 50000 or global_row.cost + 5000 > 35000000 then
    return jsonb_build_object('error','shared_capacity_reached','status',429,'retry_after',3600); end if;
  select count into user_count from buckets where id = user_key;
  if user_count >= quota then
    return jsonb_build_object('error','quota_exceeded','status',429,'retry_after',3600); end if;
  select count(*) into active_count from leases where subject = subject_key;
  if active_count >= (case when p_demo then 1 else 2 end) then
    return jsonb_build_object('error','concurrency_limit','status',429,'retry_after',30); end if;
  if (select count(*) from leases) >= 8 or exists(select 1 from leases where origin = p_origin) then
    return jsonb_build_object('error','scanner_busy','status',429,'retry_after',30); end if;
  if not public.amp_rate('scan-minute:' || subject_key, case when p_demo then 2 else 10 end, 60) then
    return jsonb_build_object('error','rate_limit','status',429,'retry_after',60); end if;
  update buckets set count = count + 1, cost = cost + 5000 where id = month_key;
  update buckets set count = count + 1 where id = user_key;
  insert into leases(subject,origin,month_bucket) values(subject_key,p_origin,month_key) returning id into lease_id;
  return jsonb_build_object('lease',lease_id,'limit',quota,'remaining',quota-user_count-1);
end $$;

create or replace function public.amp_finish(p_id uuid, p_cost integer)
returns void language plpgsql security definer set search_path = pg_catalog, amp_private as $$
declare row leases%rowtype;
begin
  perform pg_advisory_xact_lock(81294001);
  select * into row from leases where id = p_id;
  if row.id is null then return; end if;
  -- Unknown/crashed executions retain the entire reservation. Completion is idempotent.
  update buckets set cost = greatest(0, cost - (5000 - greatest(100,least(5000,p_cost))))
    where id = row.month_bucket;
  delete from leases where id = p_id;
end $$;
revoke all on function public.amp_rate(text,integer,integer) from public, anon, authenticated;
revoke all on function public.amp_keys(text,uuid,text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.amp_reserve(text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.amp_finish(uuid,integer) from public, anon, authenticated;
grant execute on function public.amp_rate(text,integer,integer) to service_role;
grant execute on function public.amp_keys(text,uuid,text,text,text,uuid) to service_role;
grant execute on function public.amp_reserve(text,text,text,boolean) to service_role;
grant execute on function public.amp_finish(uuid,integer) to service_role;

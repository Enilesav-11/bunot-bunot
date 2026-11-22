create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

create table private.rate_limits (
  rate_key text not null,
  scope text not null,
  window_start timestamptz not null,
  request_count integer not null,
  primary key (rate_key, scope, window_start)
);

create table public.bunutan_sessions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  public_id text not null unique check (length(public_id) between 32 and 80),
  session_name text not null check (length(btrim(session_name)) between 1 and 120),
  description text check (description is null or length(description) <= 2000),
  management_token_hash text not null check (management_token_hash ~ '^[0-9a-f]{64}$'),
  recovery_code_hash text check (recovery_code_hash is null or recovery_code_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  last_activity_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null default (pg_catalog.now() + interval '30 days'),
  recovery_expires_at timestamptz not null default (pg_catalog.now() + interval '60 days')
);

create table public.participants (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  session_id uuid not null references public.bunutan_sessions(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (id, session_id)
);
create index participants_session_status_idx on public.participants (session_id, status, created_at);

create table public.draw_rounds (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  session_id uuid not null references public.bunutan_sessions(id) on delete restrict,
  round_number integer not null check (round_number > 0),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  started_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  unique (session_id, round_number),
  unique (id, session_id),
  check ((status = 'in_progress' and completed_at is null) or (status = 'completed' and completed_at is not null))
);
create unique index draw_rounds_one_active_idx on public.draw_rounds (session_id) where status = 'in_progress';

create table public.draw_round_participants (
  round_id uuid not null,
  session_id uuid not null,
  participant_id uuid not null,
  display_name text not null,
  primary key (round_id, participant_id),
  unique (round_id, participant_id, session_id),
  foreign key (round_id, session_id) references public.draw_rounds(id, session_id) on delete restrict,
  foreign key (participant_id, session_id) references public.participants(id, session_id) on delete restrict
);

create table public.draw_results (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  round_id uuid not null,
  session_id uuid not null,
  participant_id uuid not null,
  draw_order integer not null check (draw_order > 0),
  request_key uuid not null,
  drawn_at timestamptz not null default pg_catalog.now(),
  unique (round_id, participant_id),
  unique (round_id, draw_order),
  unique (round_id, request_key),
  foreign key (round_id, participant_id, session_id)
    references public.draw_round_participants(round_id, participant_id, session_id) on delete restrict
);
create index draw_results_session_round_order_idx on public.draw_results (session_id, round_id, draw_order);

alter table public.bunutan_sessions enable row level security;
alter table public.participants enable row level security;
alter table public.draw_rounds enable row level security;
alter table public.draw_round_participants enable row level security;
alter table public.draw_results enable row level security;
revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

create function private.enforce_rate_limit(p_rate_key text, p_scope text, p_limit integer, p_window_seconds integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := pg_catalog.to_timestamp(
    floor(extract(epoch from pg_catalog.clock_timestamp()) / p_window_seconds) * p_window_seconds
  );
  v_count integer;
begin
  insert into private.rate_limits (rate_key, scope, window_start, request_count)
  values (p_rate_key, p_scope, v_window, 1)
  on conflict (rate_key, scope, window_start)
  do update set request_count = private.rate_limits.request_count + 1
  returning request_count into v_count;
  if v_count > p_limit then raise exception using errcode = 'P0001', message = 'rate_limited'; end if;
end;
$$;

create function private.authorize_session(
  p_session_id uuid, p_capability text, p_rate_key text, p_lock boolean default false, p_write boolean default false
)
returns public.bunutan_sessions language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions;
begin
  perform private.enforce_rate_limit(p_rate_key, 'manage:' || p_session_id::text, 180, 60);
  if p_capability is null or length(p_capability) < 40 or length(p_capability) > 100 then
    raise exception using errcode = 'P0002', message = 'session_not_found';
  end if;
  if p_lock then
    select * into v_session from public.bunutan_sessions s where s.id = p_session_id for update;
  else
    select * into v_session from public.bunutan_sessions s where s.id = p_session_id;
  end if;
  if not found or v_session.expires_at <= pg_catalog.now()
     or v_session.management_token_hash <> pg_catalog.encode(extensions.digest(p_capability, 'sha256'), 'hex') then
    raise exception using errcode = 'P0002', message = 'session_not_found';
  end if;
  if p_write and v_session.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'session_archived';
  end if;
  if p_write then
    update public.bunutan_sessions
    set last_activity_at = pg_catalog.now(), updated_at = pg_catalog.now(),
        expires_at = pg_catalog.now() + interval '30 days',
        recovery_expires_at = pg_catalog.now() + interval '60 days'
    where id = p_session_id;
    v_session.last_activity_at := pg_catalog.now();
    v_session.updated_at := pg_catalog.now();
    v_session.expires_at := pg_catalog.now() + interval '30 days';
    v_session.recovery_expires_at := pg_catalog.now() + interval '60 days';
  end if;
  return v_session;
end;
$$;

create function public.create_bunutan_session(
  p_session_name text, p_description text, p_public_id text,
  p_management_hash text, p_recovery_hash text, p_rate_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions;
begin
  perform private.enforce_rate_limit(p_rate_key, 'create', 20, 86400);
  if length(btrim(p_session_name)) not between 1 and 120
     or (p_description is not null and length(p_description) > 2000)
     or p_public_id !~ '^[A-Za-z0-9_-]{32,80}$'
     or p_management_hash !~ '^[0-9a-f]{64}$'
     or p_recovery_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_session_data';
  end if;
  insert into public.bunutan_sessions (session_name, description, public_id, management_token_hash, recovery_code_hash)
  values (btrim(p_session_name), nullif(btrim(p_description), ''), p_public_id, p_management_hash, p_recovery_hash)
  returning * into v_session;
  return pg_catalog.jsonb_build_object('session_id', v_session.id, 'public_id', v_session.public_id, 'expires_at', v_session.expires_at);
end;
$$;

create function public.get_bunutan_session(p_session_id uuid, p_capability text, p_rate_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_session public.bunutan_sessions;
  v_participants jsonb;
  v_rounds jsonb;
begin
  v_session := private.authorize_session(p_session_id, p_capability, p_rate_key, true, false);
  perform private.enforce_rate_limit(p_rate_key, 'read:' || p_session_id::text, 180, 60);
  if v_session.status = 'active' then
    update public.bunutan_sessions set last_activity_at = pg_catalog.now(), updated_at = pg_catalog.now(),
      expires_at = pg_catalog.now() + interval '30 days', recovery_expires_at = pg_catalog.now() + interval '60 days'
    where id = p_session_id;
    v_session.expires_at := pg_catalog.now() + interval '30 days';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', p.id, 'display_name', p.display_name, 'status', p.status, 'created_at', p.created_at
  ) order by p.created_at, p.id), '[]'::jsonb)
  into v_participants from public.participants p where p.session_id = p_session_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', r.id, 'round_number', r.round_number, 'status', r.status, 'started_at', r.started_at,
    'participant_count', (select count(*)::integer from public.draw_round_participants rp where rp.round_id = r.id),
    'results', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', dr.id, 'participant_id', dr.participant_id, 'display_name', rp.display_name,
      'draw_order', dr.draw_order, 'drawn_at', dr.drawn_at
    ) order by dr.draw_order), '[]'::jsonb)
      from public.draw_results dr join public.draw_round_participants rp
        on rp.round_id = dr.round_id and rp.participant_id = dr.participant_id
      where dr.round_id = r.id)
  ) order by r.round_number desc), '[]'::jsonb)
  into v_rounds from public.draw_rounds r where r.session_id = p_session_id;

  return pg_catalog.jsonb_build_object(
    'session', pg_catalog.jsonb_build_object(
      'id', v_session.id, 'session_name', v_session.session_name, 'description', v_session.description,
      'public_id', v_session.public_id, 'status', v_session.status,
      'created_at', v_session.created_at, 'expires_at', v_session.expires_at
    ), 'participants', v_participants, 'rounds', v_rounds
  );
end;
$$;

create function public.update_bunutan_session(
  p_session_id uuid, p_capability text, p_rate_key text, p_session_name text, p_description text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions;
begin
  v_session := private.authorize_session(p_session_id, p_capability, p_rate_key, true, true);
  if length(btrim(p_session_name)) not between 1 and 120 or (p_description is not null and length(p_description) > 2000) then
    raise exception using errcode = '22023', message = 'invalid_session_data';
  end if;
  update public.bunutan_sessions set session_name = btrim(p_session_name), description = nullif(btrim(p_description), '') where id = p_session_id;
  return true;
end;
$$;

create function public.add_bunutan_participants(p_session_id uuid, p_capability text, p_rate_key text, p_names text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions; v_added integer;
begin
  v_session := private.authorize_session(p_session_id, p_capability, p_rate_key, true, true);
  if coalesce(pg_catalog.cardinality(p_names), 0) not between 1 and 500
     or exists (select 1 from pg_catalog.unnest(p_names) n where n is null or length(btrim(n)) not between 1 and 120) then
    raise exception using errcode = '22023', message = 'invalid_participants';
  end if;
  if exists (select 1 from public.draw_rounds r where r.session_id = p_session_id and r.status = 'in_progress') then
    raise exception using errcode = 'P0001', message = 'round_in_progress';
  end if;
  if (select count(*) from public.participants p where p.session_id = p_session_id) + pg_catalog.cardinality(p_names) > 5000 then
    raise exception using errcode = 'P0001', message = 'participant_limit';
  end if;
  insert into public.participants (session_id, display_name)
  select p_session_id, btrim(n) from pg_catalog.unnest(p_names) n;
  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

create function public.update_bunutan_participant(
  p_session_id uuid, p_capability text, p_rate_key text, p_participant_id uuid, p_display_name text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions;
begin
  v_session := private.authorize_session(p_session_id, p_capability, p_rate_key, true, true);
  if length(btrim(p_display_name)) not between 1 and 120 then raise exception using errcode = '22023', message = 'invalid_name'; end if;
  if exists (select 1 from public.draw_rounds r where r.session_id = p_session_id and r.status = 'in_progress') then
    raise exception using errcode = 'P0001', message = 'round_in_progress';
  end if;
  update public.participants set display_name = btrim(p_display_name), updated_at = pg_catalog.now()
  where id = p_participant_id and session_id = p_session_id and status = 'active';
  if not found then raise exception using errcode = 'P0002', message = 'participant_not_found'; end if;
  return true;
end;
$$;

create function public.remove_bunutan_participant(
  p_session_id uuid, p_capability text, p_rate_key text, p_participant_id uuid
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions;
begin
  v_session := private.authorize_session(p_session_id, p_capability, p_rate_key, true, true);
  if exists (select 1 from public.draw_rounds r where r.session_id = p_session_id and r.status = 'in_progress') then
    raise exception using errcode = 'P0001', message = 'round_in_progress';
  end if;
  update public.participants set status = 'removed', updated_at = pg_catalog.now()
  where id = p_participant_id and session_id = p_session_id and status = 'active';
  if not found then raise exception using errcode = 'P0002', message = 'participant_not_found'; end if;
  return true;
end;
$$;

create function public.start_bunutan_round(p_session_id uuid, p_capability text, p_rate_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions; v_round_id uuid; v_round_number integer;
begin
  v_session := private.authorize_session(p_session_id, p_capability, p_rate_key, true, true);
  select r.id into v_round_id from public.draw_rounds r where r.session_id = p_session_id and r.status = 'in_progress';
  if found then return v_round_id; end if;
  if not exists (select 1 from public.participants p where p.session_id = p_session_id and p.status = 'active') then
    raise exception using errcode = 'P0001', message = 'no_participants';
  end if;
  select coalesce(max(r.round_number), 0) + 1 into v_round_number from public.draw_rounds r where r.session_id = p_session_id;
  insert into public.draw_rounds (session_id, round_number) values (p_session_id, v_round_number) returning id into v_round_id;
  insert into public.draw_round_participants (round_id, session_id, participant_id, display_name)
  select v_round_id, p_session_id, p.id, p.display_name from public.participants p
  where p.session_id = p_session_id and p.status = 'active';
  return v_round_id;
end;
$$;

create function public.draw_bunutan_next(p_session_id uuid, p_capability text, p_rate_key text, p_round_id uuid, p_request_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_session public.bunutan_sessions;
  v_round public.draw_rounds;
  v_old public.draw_results;
  v_result_id uuid;
  v_participant_id uuid;
  v_display_name text;
  v_order integer;
  v_remaining integer;
  v_eligible integer;
  v_bytes bytea;
  v_i integer;
  v_raw numeric;
  v_limit numeric;
  v_offset bigint;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  v_session := private.authorize_session(p_session_id, p_capability, p_rate_key, false, true);
  select * into v_round from public.draw_rounds r
  where r.id = p_round_id and r.session_id = p_session_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'round_not_found'; end if;

  select * into v_old from public.draw_results r where r.round_id = p_round_id and r.request_key = p_request_key;
  if found then
    select rp.display_name into v_display_name from public.draw_round_participants rp
    where rp.round_id = p_round_id and rp.participant_id = v_old.participant_id;
    select count(*)::integer into v_remaining from public.draw_round_participants rp
    where rp.round_id = p_round_id and not exists (
      select 1 from public.draw_results dr where dr.round_id = p_round_id and dr.participant_id = rp.participant_id
    );
    return pg_catalog.jsonb_build_object('result', pg_catalog.jsonb_build_object(
      'id', v_old.id, 'participant_id', v_old.participant_id, 'display_name', v_display_name,
      'draw_order', v_old.draw_order, 'drawn_at', v_old.drawn_at
    ), 'remaining_count', v_remaining, 'round_status', v_round.status, 'replayed', true);
  end if;
  if v_round.status <> 'in_progress' or p_request_key is null then raise exception using errcode = 'P0001', message = 'round_complete'; end if;
  select count(*)::integer into v_eligible from public.draw_round_participants rp
  where rp.round_id = p_round_id and not exists (
    select 1 from public.draw_results dr where dr.round_id = p_round_id and dr.participant_id = rp.participant_id
  );
  if v_eligible = 0 then raise exception using errcode = 'P0001', message = 'round_complete'; end if;

  v_limit := pg_catalog.floor(18446744073709551616::numeric / v_eligible) * v_eligible;
  loop
    v_bytes := extensions.gen_random_bytes(8);
    v_raw := 0;
    for v_i in 0..7 loop v_raw := v_raw * 256 + pg_catalog.get_byte(v_bytes, v_i); end loop;
    exit when v_raw < v_limit;
  end loop;
  v_offset := pg_catalog.mod(v_raw, v_eligible)::bigint;
  select rp.participant_id, rp.display_name into v_participant_id, v_display_name
  from public.draw_round_participants rp
  where rp.round_id = p_round_id and not exists (
    select 1 from public.draw_results dr where dr.round_id = p_round_id and dr.participant_id = rp.participant_id
  ) order by rp.participant_id offset v_offset limit 1;
  select coalesce(max(dr.draw_order), 0) + 1 into v_order from public.draw_results dr where dr.round_id = p_round_id;
  insert into public.draw_results (round_id, session_id, participant_id, draw_order, request_key, drawn_at)
  values (p_round_id, p_session_id, v_participant_id, v_order, p_request_key, v_now) returning id into v_result_id;
  select count(*)::integer into v_remaining from public.draw_round_participants rp
  where rp.round_id = p_round_id and not exists (
    select 1 from public.draw_results dr where dr.round_id = p_round_id and dr.participant_id = rp.participant_id
  );
  if v_remaining = 0 then
    update public.draw_rounds set status = 'completed', completed_at = v_now where id = p_round_id;
    v_round.status := 'completed';
  end if;
  return pg_catalog.jsonb_build_object('result', pg_catalog.jsonb_build_object(
    'id', v_result_id, 'participant_id', v_participant_id, 'display_name', v_display_name,
    'draw_order', v_order, 'drawn_at', v_now
  ), 'remaining_count', v_remaining, 'round_status', v_round.status, 'replayed', false);
end;
$$;

create function public.get_public_bunutan(p_public_id text, p_rate_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_session public.bunutan_sessions;
  v_round public.draw_rounds;
  v_result public.draw_results;
  v_name text;
  v_total integer;
  v_remaining integer;
  v_has_round boolean;
begin
  perform private.enforce_rate_limit(p_rate_key, 'public', 180, 60);
  select * into v_session from public.bunutan_sessions s
  where s.public_id = p_public_id and s.expires_at > pg_catalog.now();
  if not found then return null; end if;
  select * into v_round from public.draw_rounds r where r.session_id = v_session.id order by r.round_number desc limit 1;
  v_has_round := found;
  select count(*)::integer into v_total from public.participants p where p.session_id = v_session.id and p.status = 'active';
  v_remaining := v_total;
  if v_has_round then
    select count(*)::integer into v_remaining from public.draw_round_participants rp where rp.round_id = v_round.id
      and not exists (select 1 from public.draw_results dr where dr.round_id = v_round.id and dr.participant_id = rp.participant_id);
    select * into v_result from public.draw_results dr where dr.round_id = v_round.id order by dr.draw_order desc limit 1;
    if found then select rp.display_name into v_name from public.draw_round_participants rp
      where rp.round_id = v_round.id and rp.participant_id = v_result.participant_id; end if;
  end if;
  return pg_catalog.jsonb_build_object(
    'session_name', v_session.session_name, 'status', v_session.status,
    'round_number', case when v_has_round then v_round.round_number else null end,
    'round_status', case when v_has_round then v_round.status else null end,
    'latest_name', v_name, 'draw_order', v_result.draw_order,
    'remaining_count', v_remaining, 'participant_count', case when v_has_round then
      (select count(*)::integer from public.draw_round_participants rp where rp.round_id = v_round.id) else v_total end
  );
end;
$$;

create function public.recover_bunutan_session(
  p_session_id uuid, p_recovery_hash text, p_management_hash text, p_rate_key text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions;
begin
  perform private.enforce_rate_limit(p_rate_key, 'recover:' || p_session_id::text, 8, 3600);
  select * into v_session from public.bunutan_sessions s where s.id = p_session_id for update;
  if not found or v_session.recovery_code_hash is null or v_session.recovery_code_hash <> p_recovery_hash
     or v_session.recovery_expires_at <= pg_catalog.now() or p_management_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0002', message = 'recovery_failed';
  end if;
  update public.bunutan_sessions set management_token_hash = p_management_hash, recovery_code_hash = null,
    status = 'active', last_activity_at = pg_catalog.now(), updated_at = pg_catalog.now(),
    expires_at = pg_catalog.now() + interval '30 days', recovery_expires_at = pg_catalog.now() + interval '60 days'
  where id = p_session_id;
  return true;
end;
$$;

create function public.archive_bunutan_session(p_session_id uuid, p_capability text, p_rate_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions;
begin
  v_session := private.authorize_session(p_session_id, p_capability, p_rate_key, true, true);
  if exists (select 1 from public.draw_rounds r where r.session_id = p_session_id and r.status = 'in_progress') then
    raise exception using errcode = 'P0001', message = 'round_in_progress';
  end if;
  update public.bunutan_sessions set status = 'archived' where id = p_session_id;
  return true;
end;
$$;

create function public.purge_expired_bunutan_sessions()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_deleted integer;
begin
  delete from public.draw_results dr using public.bunutan_sessions s
  where dr.session_id = s.id and s.recovery_expires_at <= pg_catalog.now();
  delete from public.draw_round_participants rp using public.bunutan_sessions s
  where rp.session_id = s.id and s.recovery_expires_at <= pg_catalog.now();
  delete from public.draw_rounds r using public.bunutan_sessions s
  where r.session_id = s.id and s.recovery_expires_at <= pg_catalog.now();
  delete from public.participants p using public.bunutan_sessions s
  where p.session_id = s.id and s.recovery_expires_at <= pg_catalog.now();
  delete from public.bunutan_sessions s where s.recovery_expires_at <= pg_catalog.now();
  get diagnostics v_deleted = row_count;
  delete from private.rate_limits where window_start < pg_catalog.now() - interval '2 days';
  return v_deleted;
end;
$$;

revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function public.create_bunutan_session(text, text, text, text, text, text) to service_role;
grant execute on function public.get_bunutan_session(uuid, text, text) to service_role;
grant execute on function public.update_bunutan_session(uuid, text, text, text, text) to service_role;
grant execute on function public.add_bunutan_participants(uuid, text, text, text[]) to service_role;
grant execute on function public.update_bunutan_participant(uuid, text, text, uuid, text) to service_role;
grant execute on function public.remove_bunutan_participant(uuid, text, text, uuid) to service_role;
grant execute on function public.start_bunutan_round(uuid, text, text) to service_role;
grant execute on function public.draw_bunutan_next(uuid, text, text, uuid, uuid) to service_role;
grant execute on function public.get_public_bunutan(text, text) to service_role;
grant execute on function public.recover_bunutan_session(uuid, text, text, text) to service_role;
grant execute on function public.archive_bunutan_session(uuid, text, text) to service_role;
grant execute on function public.purge_expired_bunutan_sessions() to service_role;

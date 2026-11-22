-- Online Secret Santa data is additive; existing raffle sessions keep their current flow.
alter table private.rate_limits enable row level security;

alter table public.bunutan_sessions
  add column is_online_event boolean not null default false,
  add column event_status text,
  add column event_timezone text not null default 'Asia/Manila',
  add column registration_deadline timestamptz,
  add column assignment_release_at timestamptz,
  add column event_date timestamptz,
  add column gift_budget numeric(10,2),
  add column instructions text,
  add column wishlists_enabled boolean not null default false,
  add constraint bunutan_sessions_event_status_check check (
    (not is_online_event and event_status is null) or
    (is_online_event and event_status in ('draft','inviting','registration_open','registration_closed','roster_locked','assignments_generated','completed','cancelled'))
  ),
  add constraint bunutan_sessions_online_fields_check check (
    length(event_timezone) between 1 and 80 and
    (gift_budget is null or gift_budget between 0.01 and 1000000) and
    (instructions is null or length(instructions) <= 4000)
  );

alter table public.participants
  add column registration_status text not null default 'confirmed'
    check (registration_status in ('pending','confirmed','declined','revoked')),
  add column participant_token_hash text,
  add column invitation_claimed_at timestamptz,
  add column confirmed_at timestamptz,
  add column declined_at timestamptz;
create unique index participants_gift_token_hash_uidx on public.participants (participant_token_hash) where participant_token_hash is not null;
create index participants_online_roster_idx on public.participants (session_id, registration_status, created_at);

create table public.gift_assignment_rounds (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  session_id uuid not null references public.bunutan_sessions(id) on delete restrict,
  round_number integer not null check (round_number > 0),
  status text not null default 'ready' check (status in ('ready','completed','voided')),
  participant_count integer not null check (participant_count >= 2),
  generated_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  unique (session_id, round_number),
  unique (id, session_id),
  check (status <> 'completed' or completed_at is not null)
);
create unique index gift_assignment_rounds_one_ready_idx on public.gift_assignment_rounds(session_id) where status = 'ready';

create table public.gift_assignments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  round_id uuid not null,
  session_id uuid not null,
  giver_participant_id uuid not null,
  recipient_participant_id uuid not null,
  revealed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  unique (round_id, giver_participant_id),
  unique (round_id, recipient_participant_id),
  check (giver_participant_id <> recipient_participant_id),
  foreign key (round_id, session_id) references public.gift_assignment_rounds(id, session_id) on delete restrict,
  foreign key (giver_participant_id, session_id) references public.participants(id, session_id) on delete restrict,
  foreign key (recipient_participant_id, session_id) references public.participants(id, session_id) on delete restrict
);
create index gift_assignments_giver_idx on public.gift_assignments(session_id, giver_participant_id, round_id);

create table public.participant_wishlists (
  participant_id uuid primary key,
  session_id uuid not null,
  preferences jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(preferences) = 'object' and pg_catalog.octet_length(preferences::text) <= 6000),
  message text check (message is null or length(message) <= 1000),
  updated_at timestamptz not null default pg_catalog.now(),
  foreign key (participant_id, session_id) references public.participants(id, session_id) on delete restrict
);

alter table public.gift_assignment_rounds enable row level security;
alter table public.gift_assignments enable row level security;
alter table public.participant_wishlists enable row level security;
revoke all on public.gift_assignment_rounds, public.gift_assignments, public.participant_wishlists from public, anon, authenticated;

create function private.random_index(p_upper integer)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_bytes bytea; v_raw numeric; v_limit numeric; v_i integer;
begin
  if p_upper < 1 then raise exception using errcode = '22023', message = 'invalid_random_range'; end if;
  v_limit := pg_catalog.floor(18446744073709551616::numeric / p_upper) * p_upper;
  loop
    v_bytes := extensions.gen_random_bytes(8);
    v_raw := 0;
    for v_i in 0..7 loop v_raw := v_raw * 256 + pg_catalog.get_byte(v_bytes, v_i); end loop;
    exit when v_raw < v_limit;
  end loop;
  return pg_catalog.mod(v_raw, p_upper)::integer + 1;
end;
$$;

create function private.authorize_gift_participant(p_token_hash text, p_rate_key text)
returns public.participants language plpgsql security definer set search_path = '' as $$
declare v_participant public.participants; v_session public.bunutan_sessions; v_participant_id uuid; v_session_id uuid;
begin
  perform private.enforce_rate_limit(p_rate_key, 'gift:participant', 90, 60);
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0002', message = 'participant_not_found';
  end if;
  select p.id,p.session_id into v_participant_id,v_session_id from public.participants p where p.participant_token_hash=p_token_hash;
  if not found then
    raise exception using errcode = 'P0002', message = 'participant_not_found';
  end if;
  select * into v_session from public.bunutan_sessions s where s.id=v_session_id for update;
  if not found then raise exception using errcode='P0002',message='participant_not_found'; end if;
  select * into v_participant from public.participants p where p.id=v_participant_id and p.participant_token_hash=p_token_hash for update;
  if not found or v_participant.registration_status='revoked' then raise exception using errcode='P0002',message='participant_not_found'; end if;
  if not v_session.is_online_event or v_session.status <> 'active'
     or v_session.expires_at <= pg_catalog.now() or v_session.event_status = 'cancelled' then
    raise exception using errcode = 'P0002', message = 'participant_not_found';
  end if;
  return v_participant;
end;
$$;

create or replace function private.authorize_session(
  p_session_id uuid,p_capability text,p_rate_key text,p_lock boolean default false,p_write boolean default false
)
returns public.bunutan_sessions language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions; v_expiry timestamptz; v_recovery_expiry timestamptz;
begin
  perform private.enforce_rate_limit(p_rate_key,'manage:global',240,60);
  perform private.enforce_rate_limit(p_rate_key,'manage:'||p_session_id::text,180,60);
  if p_capability is null or length(p_capability)<40 or length(p_capability)>100 then raise exception using errcode='P0002',message='session_not_found'; end if;
  if p_lock then select * into v_session from public.bunutan_sessions where id=p_session_id for update;
  else select * into v_session from public.bunutan_sessions where id=p_session_id; end if;
  if not found or v_session.expires_at<=pg_catalog.now()
     or v_session.management_token_hash<>pg_catalog.encode(extensions.digest(p_capability,'sha256'),'hex') then
    raise exception using errcode='P0002',message='session_not_found';
  end if;
  if p_write and v_session.status<>'active' then raise exception using errcode='P0001',message='session_archived'; end if;
  if p_write then
    v_expiry:=pg_catalog.now()+interval '30 days'; v_recovery_expiry:=pg_catalog.now()+interval '60 days';
    if v_session.is_online_event then
      v_expiry:=greatest(v_expiry,coalesce(v_session.registration_deadline+interval '60 days',v_expiry),
        coalesce(v_session.assignment_release_at+interval '60 days',v_expiry),coalesce(v_session.event_date+interval '60 days',v_expiry));
      v_recovery_expiry:=greatest(v_recovery_expiry,coalesce(v_session.registration_deadline+interval '60 days',v_recovery_expiry),
        coalesce(v_session.assignment_release_at+interval '60 days',v_recovery_expiry),coalesce(v_session.event_date+interval '60 days',v_recovery_expiry));
    end if;
    update public.bunutan_sessions set last_activity_at=pg_catalog.now(),updated_at=pg_catalog.now(),expires_at=v_expiry,recovery_expires_at=v_recovery_expiry where id=p_session_id;
    v_session.last_activity_at:=pg_catalog.now(); v_session.updated_at:=pg_catalog.now();
    v_session.expires_at:=v_expiry; v_session.recovery_expires_at:=v_recovery_expiry;
  end if;
  return v_session;
end;
$$;

create function private.guard_online_roster_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_session_id uuid; v_online boolean;
begin
  if tg_op='DELETE' then v_session_id:=old.session_id; else v_session_id:=new.session_id; end if;
  select is_online_event into v_online from public.bunutan_sessions where id=v_session_id;
  if coalesce(v_online,false) and pg_catalog.current_setting('app.online_event_write',true)<>'on' then
    if tg_op='DELETE' and exists(select 1 from public.bunutan_sessions where id=v_session_id and recovery_expires_at<=pg_catalog.now()) then return old; end if;
    raise exception using errcode='P0001',message='use_online_event_operations';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
create trigger guard_online_participants before insert or update or delete on public.participants
for each row execute function private.guard_online_roster_write();

create function private.guard_online_raffle_round()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.bunutan_sessions where id=new.session_id and is_online_event) then
    raise exception using errcode='P0001',message='use_online_event_operations';
  end if;
  return new;
end;
$$;
create trigger guard_online_draw_round before insert on public.draw_rounds
for each row execute function private.guard_online_raffle_round();

create function private.guard_online_archive()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status='archived' and old.is_online_event then
    raise exception using errcode='P0001',message='use_online_event_operations';
  end if;
  return new;
end;
$$;
create trigger guard_online_session_archive before update of status on public.bunutan_sessions
for each row execute function private.guard_online_archive();

create function public.create_online_bunutan_session(
  p_session_name text, p_description text, p_registration_deadline timestamptz,
  p_assignment_release_at timestamptz, p_event_date timestamptz, p_event_timezone text,
  p_gift_budget numeric, p_instructions text, p_wishlists_enabled boolean,
  p_public_id text, p_management_hash text, p_recovery_hash text, p_rate_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions;
begin
  perform private.enforce_rate_limit(p_rate_key,'create',20,86400);
  if length(btrim(p_session_name)) not between 1 and 120 or (p_description is not null and length(p_description)>2000)
     or p_public_id !~ '^[A-Za-z0-9_-]{32,80}$' or p_management_hash !~ '^[0-9a-f]{64}$'
     or p_recovery_hash is null or p_recovery_hash !~ '^[0-9a-f]{64}$' or p_event_timezone is null or length(p_event_timezone) not between 1 and 80
     or (p_gift_budget is not null and p_gift_budget not between 0.01 and 1000000)
     or (p_instructions is not null and length(p_instructions)>4000)
     or p_registration_deadline is null or p_assignment_release_at is null then
    raise exception using errcode='22023',message='invalid_online_event';
  end if;
  insert into public.bunutan_sessions(session_name,description,public_id,management_token_hash,recovery_code_hash,
    is_online_event,event_status,event_timezone,registration_deadline,assignment_release_at,event_date,gift_budget,instructions,wishlists_enabled)
  values(btrim(p_session_name),nullif(btrim(p_description),''),p_public_id,p_management_hash,p_recovery_hash,
    true,'draft',p_event_timezone,p_registration_deadline,p_assignment_release_at,p_event_date,p_gift_budget,
    nullif(btrim(p_instructions),''),coalesce(p_wishlists_enabled,false)) returning * into v_session;
  update public.bunutan_sessions set expires_at=greatest(expires_at,p_registration_deadline+interval '60 days',p_assignment_release_at+interval '60 days',coalesce(p_event_date+interval '60 days',expires_at)),
    recovery_expires_at=greatest(recovery_expires_at,p_registration_deadline+interval '60 days',p_assignment_release_at+interval '60 days',coalesce(p_event_date+interval '60 days',recovery_expires_at)) where id=v_session.id;
  return pg_catalog.jsonb_build_object('session_id',v_session.id,'public_id',v_session.public_id);
end;
$$;

create function public.open_bunutan_registration(p_session_id uuid,p_capability text,p_rate_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions;
begin
  v_session:=private.authorize_session(p_session_id,p_capability,p_rate_key,true,true);
  if v_session.is_online_event and v_session.event_status='registration_open' then return true; end if;
  if not v_session.is_online_event or v_session.event_status not in ('draft','inviting','registration_closed')
     or v_session.registration_deadline<=pg_catalog.now()
     or exists(select 1 from public.gift_assignment_rounds where session_id=p_session_id and status='ready') then
    raise exception using errcode='P0001',message='registration_cannot_open';
  end if;
  update public.bunutan_sessions set event_status='registration_open' where id=p_session_id;
  return true;
end;
$$;

create function public.close_bunutan_registration(p_session_id uuid,p_capability text,p_rate_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions;
begin
  v_session:=private.authorize_session(p_session_id,p_capability,p_rate_key,true,true);
  if v_session.is_online_event and v_session.event_status='registration_closed' then return true; end if;
  if not v_session.is_online_event or v_session.event_status not in ('draft','inviting','registration_open') then raise exception using errcode='P0001',message='registration_cannot_close'; end if;
  update public.bunutan_sessions set event_status='registration_closed' where id=p_session_id;
  return true;
end;
$$;

create or replace function public.add_gift_exchange_invites(p_session_id uuid,p_capability text,p_rate_key text,p_names text[],p_token_hashes text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions; v_result jsonb;
begin
  v_session:=private.authorize_session(p_session_id,p_capability,p_rate_key,true,true);
  if not v_session.is_online_event or v_session.event_status not in ('draft','inviting','registration_open')
     or exists(select 1 from public.gift_assignment_rounds r where r.session_id=p_session_id and r.status='ready') then
    raise exception using errcode='P0001',message='roster_locked';
  end if;
  if coalesce(pg_catalog.cardinality(p_names),0) not between 1 and 500 or pg_catalog.cardinality(p_names)<>pg_catalog.cardinality(p_token_hashes)
     or exists(select 1 from pg_catalog.unnest(p_names) n where n is null or length(btrim(n)) not between 1 and 120)
     or exists(select 1 from pg_catalog.unnest(p_token_hashes) h where h is null or h !~ '^[0-9a-f]{64}$') then
    raise exception using errcode='22023',message='invalid_invites';
  end if;
  if (select count(*) from public.participants where session_id=p_session_id)+pg_catalog.cardinality(p_names)>5000 then
    raise exception using errcode='P0001',message='participant_limit';
  end if;
  perform pg_catalog.set_config('app.online_event_write','on',true);
  with input as (
    select btrim(n) as display_name,p_token_hashes[ord] as token_hash,ord from pg_catalog.unnest(p_names) with ordinality x(n,ord)
  ), inserted as (
    insert into public.participants(session_id,display_name,status,registration_status,participant_token_hash)
    select p_session_id,i.display_name,'active','pending',i.token_hash from input i order by i.ord
    returning id,display_name,participant_token_hash
  ) select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'display_name',display_name,'token_hash',participant_token_hash) order by id),'[]'::jsonb)
    into v_result from inserted;
  update public.bunutan_sessions set event_status=case when event_status='draft' then 'inviting' else event_status end where id=p_session_id;
  return v_result;
end;
$$;

create function public.update_gift_invitation(p_session_id uuid,p_capability text,p_rate_key text,p_participant_id uuid,p_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions;
begin
  v_session:=private.authorize_session(p_session_id,p_capability,p_rate_key,true,true);
  if not v_session.is_online_event or v_session.event_status not in ('draft','inviting','registration_open','registration_closed')
     or exists(select 1 from public.gift_assignment_rounds r where r.session_id=p_session_id and r.status='ready') then raise exception using errcode='P0001',message='roster_locked'; end if;
  if length(btrim(p_name)) not between 1 and 120 then raise exception using errcode='22023',message='invalid_name'; end if;
  perform pg_catalog.set_config('app.online_event_write','on',true);
  update public.participants set display_name=btrim(p_name),updated_at=pg_catalog.now()
    where id=p_participant_id and session_id=p_session_id and registration_status in ('pending','confirmed');
  if not found then raise exception using errcode='P0002',message='invite_not_found'; end if;
  return true;
end;
$$;

create function public.revoke_gift_invitation(p_session_id uuid,p_capability text,p_rate_key text,p_participant_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions;
begin
  v_session:=private.authorize_session(p_session_id,p_capability,p_rate_key,true,true);
  if not v_session.is_online_event or v_session.event_status not in ('draft','inviting','registration_open','registration_closed')
     or exists(select 1 from public.gift_assignment_rounds r where r.session_id=p_session_id and r.status='ready') then raise exception using errcode='P0001',message='roster_locked'; end if;
  perform pg_catalog.set_config('app.online_event_write','on',true);
  update public.participants set registration_status='revoked',participant_token_hash=null,status='removed',updated_at=pg_catalog.now()
    where id=p_participant_id and session_id=p_session_id and (registration_status='pending'
      or (registration_status='confirmed' and v_session.event_status='registration_closed'
        and exists(select 1 from public.gift_assignment_rounds r where r.session_id=p_session_id and r.status='voided')));
  if not found then raise exception using errcode='P0002',message='invite_not_found'; end if;
  return true;
end;
$$;

create function public.rotate_gift_participant_token(p_session_id uuid,p_capability text,p_rate_key text,p_participant_id uuid,p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions; v_participant public.participants;
begin
  v_session:=private.authorize_session(p_session_id,p_capability,p_rate_key,true,true);
  if not v_session.is_online_event or v_session.event_status in ('completed','cancelled') or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='P0001',message='link_cannot_rotate';
  end if;
  select * into v_participant from public.participants where id=p_participant_id and session_id=p_session_id and registration_status in ('pending','confirmed') for update;
  if not found then raise exception using errcode='P0002',message='invite_not_found'; end if;
  perform pg_catalog.set_config('app.online_event_write','on',true);
  update public.participants set participant_token_hash=p_token_hash,invitation_claimed_at=null,updated_at=pg_catalog.now() where id=p_participant_id;
  return pg_catalog.jsonb_build_object('id',v_participant.id,'display_name',v_participant.display_name);
end;
$$;

create function public.rotate_gift_participant_tokens(p_session_id uuid,p_capability text,p_rate_key text,p_tokens jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions; v_count integer; v_updated jsonb;
begin
  v_session:=private.authorize_session(p_session_id,p_capability,p_rate_key,true,true);
  if not v_session.is_online_event or v_session.event_status in ('completed','cancelled')
     or pg_catalog.jsonb_typeof(p_tokens)<>'array' or pg_catalog.jsonb_array_length(p_tokens)>5000
     or exists(select 1 from pg_catalog.jsonb_to_recordset(p_tokens) as x(participant_id uuid,token_hash text)
       where participant_id is null or token_hash is null or token_hash !~ '^[0-9a-f]{64}$')
     or (select count(*) from pg_catalog.jsonb_to_recordset(p_tokens) as x(participant_id uuid,token_hash text))<>
        (select count(distinct participant_id) from pg_catalog.jsonb_to_recordset(p_tokens) as x(participant_id uuid,token_hash text)) then
    raise exception using errcode='22023',message='invalid_participant_links';
  end if;
  select count(*)::int into v_count from pg_catalog.jsonb_to_recordset(p_tokens) as x(participant_id uuid,token_hash text)
    join public.participants p on p.id=x.participant_id and p.session_id=p_session_id and p.registration_status in ('pending','confirmed');
  if v_count<>(select pg_catalog.jsonb_array_length(p_tokens)) then raise exception using errcode='P0002',message='invite_not_found'; end if;
  perform pg_catalog.set_config('app.online_event_write','on',true);
  with links as (select participant_id,token_hash from pg_catalog.jsonb_to_recordset(p_tokens) as x(participant_id uuid,token_hash text)),
  updated as (
    update public.participants p set participant_token_hash=l.token_hash,invitation_claimed_at=null,updated_at=pg_catalog.now()
    from links l where p.id=l.participant_id and p.session_id=p_session_id
    returning p.id,p.display_name,p.participant_token_hash
  ) select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'display_name',display_name,'token_hash',participant_token_hash) order by id),'[]'::jsonb)
    into v_updated from updated;
  return v_updated;
end;
$$;

create function public.get_online_event_dashboard(p_session_id uuid,p_capability text,p_rate_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions; v_participants jsonb; v_rounds jsonb; v_invited int; v_confirmed int;
begin
  v_session:=private.authorize_session(p_session_id,p_capability,p_rate_key,true,false);
  if not v_session.is_online_event then raise exception using errcode='P0002',message='session_not_found'; end if;
  perform private.enforce_rate_limit(p_rate_key,'online:dashboard:'||p_session_id::text,120,60);
  select count(*) filter(where registration_status<>'revoked')::int,count(*) filter(where registration_status='confirmed')::int,
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'display_name',display_name,'registration_status',registration_status,
      'invitation_claimed_at',invitation_claimed_at,'confirmed_at',confirmed_at,'declined_at',declined_at,
      'link_issued',participant_token_hash is not null) order by created_at,id),'[]'::jsonb)
    into v_invited,v_confirmed,v_participants from public.participants where session_id=p_session_id;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',r.id,'round_number',r.round_number,'status',r.status,
      'participant_count',r.participant_count,'revealed_count',(select count(*)::int from public.gift_assignments a where a.round_id=r.id and a.revealed_at is not null),
      'generated_at',r.generated_at,'completed_at',r.completed_at) order by r.round_number desc),'[]'::jsonb)
    into v_rounds from public.gift_assignment_rounds r where r.session_id=p_session_id;
  return pg_catalog.jsonb_build_object('session',pg_catalog.jsonb_build_object(
      'id',v_session.id,'session_name',v_session.session_name,'description',v_session.description,'public_id',v_session.public_id,
      'status',v_session.status,'event_status',v_session.event_status,'event_timezone',v_session.event_timezone,
      'registration_deadline',v_session.registration_deadline,'registration_due',v_session.registration_deadline<=pg_catalog.now(),
      'assignment_release_at',v_session.assignment_release_at,
      'event_date',v_session.event_date,'gift_budget',v_session.gift_budget,'instructions',v_session.instructions,
      'wishlists_enabled',v_session.wishlists_enabled,'expires_at',v_session.expires_at),
    'participants',v_participants,'counts',pg_catalog.jsonb_build_object('invited',v_invited,'confirmed',v_confirmed,
      'pending',(select count(*)::int from public.participants where session_id=p_session_id and registration_status='pending'),
      'declined',(select count(*)::int from public.participants where session_id=p_session_id and registration_status='declined'),
      'percent',case when v_invited=0 then 0 else pg_catalog.round(v_confirmed*100.0/v_invited)::int end),
    'rounds',v_rounds);
end;
$$;

create function public.get_public_online_event(p_public_id text,p_rate_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions;
begin
  perform private.enforce_rate_limit(p_rate_key,'online:public',60,60);
  select * into v_session from public.bunutan_sessions s where s.public_id=p_public_id and s.is_online_event
    and s.expires_at>pg_catalog.now() and s.event_status<>'cancelled';
  if not found then return null; end if;
  return pg_catalog.jsonb_build_object('session_name',v_session.session_name,'description',v_session.description,
    'event_status',v_session.event_status,'registration_deadline',v_session.registration_deadline,'event_date',v_session.event_date,
    'event_timezone',v_session.event_timezone,'gift_budget',v_session.gift_budget,'instructions',v_session.instructions,
    'wishlists_enabled',v_session.wishlists_enabled,
    'confirmed_count',(select count(*)::int from public.participants where session_id=v_session.id and registration_status='confirmed'));
end;
$$;

-- Claim atomically replaces the distributed one-time invite hash with a private portal capability hash.
create function public.claim_gift_invitation(p_invitation_hash text,p_participant_hash text,p_rate_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_participant public.participants; v_session public.bunutan_sessions; v_participant_id uuid; v_session_id uuid;
begin
  perform private.enforce_rate_limit(p_rate_key,'online:claim',20,3600);
  if p_invitation_hash is null or p_invitation_hash !~ '^[0-9a-f]{64}$' or p_participant_hash is null or p_participant_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode='P0002',message='invitation_not_found'; end if;
  select id,session_id into v_participant_id,v_session_id from public.participants where participant_token_hash=p_invitation_hash;
  if not found then raise exception using errcode='P0002',message='invitation_not_found'; end if;
  select * into v_session from public.bunutan_sessions where id=v_session_id for update;
  if not found then raise exception using errcode='P0002',message='invitation_not_found'; end if;
  select * into v_participant from public.participants where id=v_participant_id and participant_token_hash=p_invitation_hash for update;
  if not found or v_participant.invitation_claimed_at is not null or v_participant.registration_status not in ('pending','confirmed') then raise exception using errcode='P0002',message='invitation_not_found'; end if;
  if not found or not v_session.is_online_event or v_session.status<>'active' or v_session.expires_at<=pg_catalog.now()
     or v_session.event_status in ('cancelled','completed')
     or (v_participant.registration_status='pending' and (v_session.event_status<>'registration_open' or v_session.registration_deadline<=pg_catalog.now())) then
    raise exception using errcode='P0001',message='registration_closed';
  end if;
  perform pg_catalog.set_config('app.online_event_write','on',true);
  update public.participants set participant_token_hash=p_participant_hash,invitation_claimed_at=pg_catalog.now(),updated_at=pg_catalog.now() where id=v_participant.id;
  return pg_catalog.jsonb_build_object('participant_id',v_participant.id);
end;
$$;

create or replace function public.get_gift_invite_portal(p_token_hash text,p_rate_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_participant public.participants; v_session public.bunutan_sessions; v_wishlist jsonb; v_assignment jsonb;
begin
  v_participant:=private.authorize_gift_participant(p_token_hash,p_rate_key);
  select * into v_session from public.bunutan_sessions where id=v_participant.session_id;
  select pg_catalog.jsonb_build_object('preferences',w.preferences,'message',w.message,'updated_at',w.updated_at)
    into v_wishlist from public.participant_wishlists w where w.participant_id=v_participant.id;
  if v_session.wishlists_enabled and v_participant.registration_status='confirmed' and v_session.assignment_release_at<=pg_catalog.now() then
    select pg_catalog.jsonb_build_object('recipient_name',rp.display_name,'revealed_at',a.revealed_at,'recipient_wishlist',
      (select pg_catalog.jsonb_build_object('preferences',w.preferences,'message',w.message) from public.participant_wishlists w where w.participant_id=a.recipient_participant_id))
      into v_assignment from public.gift_assignments a join public.gift_assignment_rounds r on r.id=a.round_id
      join public.participants rp on rp.id=a.recipient_participant_id
      where a.session_id=v_session.id and a.giver_participant_id=v_participant.id and a.revealed_at is not null and r.status in ('ready','completed');
  elsif v_participant.registration_status='confirmed' and v_session.assignment_release_at<=pg_catalog.now() then
    select pg_catalog.jsonb_build_object('recipient_name',rp.display_name,'revealed_at',a.revealed_at)
      into v_assignment from public.gift_assignments a join public.gift_assignment_rounds r on r.id=a.round_id
      join public.participants rp on rp.id=a.recipient_participant_id
      where a.session_id=v_session.id and a.giver_participant_id=v_participant.id and a.revealed_at is not null and r.status in ('ready','completed');
  end if;
  return pg_catalog.jsonb_build_object('event',pg_catalog.jsonb_build_object('session_name',v_session.session_name,
      'description',v_session.description,'event_status',v_session.event_status,'event_timezone',v_session.event_timezone,
      'registration_deadline',v_session.registration_deadline,'assignment_release_at',v_session.assignment_release_at,
      'event_date',v_session.event_date,'gift_budget',v_session.gift_budget,'instructions',v_session.instructions,
      'wishlists_enabled',v_session.wishlists_enabled),
    'participant',pg_catalog.jsonb_build_object('id',v_participant.id,'display_name',v_participant.display_name,
      'registration_status',v_participant.registration_status,'confirmed_at',v_participant.confirmed_at),
    'wishlist',v_wishlist,'my_assignment',v_assignment,'registration_open',v_session.event_status='registration_open' and v_session.registration_deadline>pg_catalog.now(),
    'assignment_available',v_session.event_status in ('assignments_generated','completed')
      and v_session.assignment_release_at<=pg_catalog.now() and v_participant.registration_status='confirmed');
end;
$$;

create function public.confirm_gift_participation(p_token_hash text,p_rate_key text,p_response text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_participant public.participants; v_session public.bunutan_sessions; v_new_status text;
begin
  if p_response not in ('confirm','decline') then raise exception using errcode='22023',message='invalid_response'; end if;
  v_participant:=private.authorize_gift_participant(p_token_hash,p_rate_key);
  select * into v_session from public.bunutan_sessions where id=v_participant.session_id for update;
  if v_session.event_status<>'registration_open' or v_session.registration_deadline<=pg_catalog.now() then raise exception using errcode='P0001',message='registration_closed'; end if;
  v_new_status:=case when p_response='confirm' then 'confirmed' else 'declined' end;
  if v_participant.registration_status in ('pending','declined') then
    perform pg_catalog.set_config('app.online_event_write','on',true);
    update public.participants set registration_status=v_new_status,
      confirmed_at=case when v_new_status='confirmed' then coalesce(confirmed_at,pg_catalog.now()) else confirmed_at end,
      declined_at=case when v_new_status='declined' then pg_catalog.now() else null end,updated_at=pg_catalog.now()
      where id=v_participant.id;
    return v_new_status;
  end if;
  if v_participant.registration_status='confirmed' and v_new_status='confirmed' then return 'confirmed'; end if;
  raise exception using errcode='P0001',message='invalid_registration_transition';
end;
$$;

create function public.save_participant_wishlist(p_token_hash text,p_rate_key text,p_preferences jsonb,p_message text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_participant public.participants; v_session public.bunutan_sessions;
begin
  v_participant:=private.authorize_gift_participant(p_token_hash,p_rate_key);
  select * into v_session from public.bunutan_sessions where id=v_participant.session_id;
  if v_participant.registration_status<>'confirmed' or not v_session.wishlists_enabled or v_session.event_status in ('cancelled','completed')
     or pg_catalog.jsonb_typeof(coalesce(p_preferences,'{}'::jsonb))<>'object'
     or pg_catalog.octet_length(coalesce(p_preferences,'{}'::jsonb)::text)>6000 or (p_message is not null and length(p_message)>1000) then
    raise exception using errcode='22023',message='invalid_wishlist';
  end if;
  insert into public.participant_wishlists(participant_id,session_id,preferences,message)
    values(v_participant.id,v_participant.session_id,coalesce(p_preferences,'{}'::jsonb),nullif(btrim(p_message),''))
    on conflict(participant_id) do update set preferences=excluded.preferences,message=excluded.message,updated_at=pg_catalog.now();
  return true;
end;
$$;

create function public.lock_gift_roster(p_session_id uuid,p_capability text,p_rate_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions; v_count integer;
begin
  v_session:=private.authorize_session(p_session_id,p_capability,p_rate_key,true,true);
  if v_session.is_online_event and v_session.event_status in ('roster_locked','assignments_generated') then return true; end if;
  if not v_session.is_online_event or v_session.event_status not in ('registration_closed','registration_open','inviting')
     or (v_session.event_status<>'registration_closed' and v_session.registration_deadline>pg_catalog.now()) then
    raise exception using errcode='P0001',message='registration_still_open';
  end if;
  select count(*)::int into v_count from public.participants where session_id=p_session_id and registration_status='confirmed';
  if v_count<2 then raise exception using errcode='P0001',message='need_two_confirmed'; end if;
  update public.bunutan_sessions set event_status='roster_locked' where id=p_session_id;
  return true;
end;
$$;

create function public.generate_gift_assignments(p_session_id uuid,p_capability text,p_rate_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_session public.bunutan_sessions; v_givers uuid[]; v_recipients uuid[]; v_n integer; v_round_id uuid; v_round_number integer;
  v_i integer; v_j integer; v_tmp uuid; v_valid boolean; v_attempt integer; v_inserted integer;
begin
  v_session:=private.authorize_session(p_session_id,p_capability,p_rate_key,true,true);
  if not v_session.is_online_event then raise exception using errcode='P0001',message='not_online_event'; end if;
  select id,round_number into v_round_id,v_round_number from public.gift_assignment_rounds where session_id=p_session_id and status='ready';
  if found then return pg_catalog.jsonb_build_object('round_id',v_round_id,'participant_count',(select count(*)::int from public.gift_assignments where round_id=v_round_id),'status','ready'); end if;
  if v_session.event_status<>'roster_locked' then raise exception using errcode='P0001',message='roster_not_locked'; end if;
  select pg_catalog.array_agg(id order by id),count(*)::int into v_givers,v_n from public.participants where session_id=p_session_id and registration_status='confirmed';
  if v_n<2 then raise exception using errcode='P0001',message='need_two_confirmed'; end if;
  v_recipients:=v_givers;
  v_valid:=false;
  for v_attempt in 1..64 loop
    for v_i in reverse v_n..2 loop
      v_j:=private.random_index(v_i);
      v_tmp:=v_recipients[v_i]; v_recipients[v_i]:=v_recipients[v_j]; v_recipients[v_j]:=v_tmp;
    end loop;
    v_valid:=true;
    for v_i in 1..v_n loop if v_givers[v_i]=v_recipients[v_i] then v_valid:=false; exit; end if; end loop;
    if v_valid then exit; end if;
  end loop;
  if not v_valid then
    -- Sattolo's algorithm gives a random single cycle after 64 rejected permutations.
    v_recipients:=v_givers;
    for v_i in reverse v_n..2 loop
      v_j:=private.random_index(v_i-1);
      v_tmp:=v_recipients[v_i]; v_recipients[v_i]:=v_recipients[v_j]; v_recipients[v_j]:=v_tmp;
    end loop;
  end if;
  for v_i in 1..v_n loop if v_givers[v_i]=v_recipients[v_i] then raise exception using errcode='P0001',message='assignment_validation_failed'; end if; end loop;
  if (select count(distinct x) from pg_catalog.unnest(v_recipients) as u(x))<>v_n then raise exception using errcode='P0001',message='assignment_validation_failed'; end if;
  select coalesce(max(round_number),0)+1 into v_round_number from public.gift_assignment_rounds where session_id=p_session_id;
  insert into public.gift_assignment_rounds(session_id,round_number,status,participant_count) values(p_session_id,v_round_number,'ready',v_n) returning id into v_round_id;
  insert into public.gift_assignments(round_id,session_id,giver_participant_id,recipient_participant_id)
    select v_round_id,p_session_id,v_givers[g.i],v_recipients[g.i] from generate_series(1,v_n) as g(i);
  get diagnostics v_inserted=row_count;
  if v_inserted<>v_n or exists(select 1 from public.gift_assignments a where a.round_id=v_round_id and a.giver_participant_id=a.recipient_participant_id)
     or (select count(distinct giver_participant_id) from public.gift_assignments where round_id=v_round_id)<>v_n
     or (select count(distinct recipient_participant_id) from public.gift_assignments where round_id=v_round_id)<>v_n then
    raise exception using errcode='P0001',message='assignment_validation_failed';
  end if;
  update public.bunutan_sessions set event_status='assignments_generated' where id=p_session_id;
  return pg_catalog.jsonb_build_object('round_id',v_round_id,'participant_count',v_n,'status','ready');
end;
$$;

create function public.reveal_gift_assignment(p_token_hash text,p_rate_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_participant public.participants; v_session public.bunutan_sessions; v_assignment public.gift_assignments; v_wishlist jsonb;
begin
  v_participant:=private.authorize_gift_participant(p_token_hash,p_rate_key);
  select * into v_session from public.bunutan_sessions where id=v_participant.session_id for update;
  if v_participant.registration_status<>'confirmed' or v_session.event_status not in ('assignments_generated','completed')
     or v_session.assignment_release_at>pg_catalog.now() then raise exception using errcode='P0001',message='assignment_not_available'; end if;
  select a.* into v_assignment from public.gift_assignments a join public.gift_assignment_rounds r on r.id=a.round_id
    where a.session_id=v_session.id and a.giver_participant_id=v_participant.id and r.status in ('ready','completed') for update of a;
  if not found then raise exception using errcode='P0002',message='assignment_not_found'; end if;
  update public.gift_assignments set revealed_at=coalesce(revealed_at,pg_catalog.now()) where id=v_assignment.id returning * into v_assignment;
  if v_session.wishlists_enabled then
    select pg_catalog.jsonb_build_object('preferences',w.preferences,'message',w.message) into v_wishlist
      from public.participant_wishlists w where w.participant_id=v_assignment.recipient_participant_id and w.session_id=v_session.id;
  end if;
  return pg_catalog.jsonb_build_object('event_name',v_session.session_name,'giver_name',v_participant.display_name,
    'recipient_name',(select display_name from public.participants where id=v_assignment.recipient_participant_id),
    'recipient_wishlist',v_wishlist,'revealed_at',v_assignment.revealed_at);
end;
$$;

create function public.void_gift_assignment_round(p_session_id uuid,p_capability text,p_rate_key text,p_round_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions; v_round public.gift_assignment_rounds;
begin
  v_session:=private.authorize_session(p_session_id,p_capability,p_rate_key,true,true);
  select * into v_round from public.gift_assignment_rounds where id=p_round_id and session_id=p_session_id for update;
  if not found or v_round.status<>'ready' or exists(select 1 from public.gift_assignments where round_id=p_round_id and revealed_at is not null) then
    raise exception using errcode='P0001',message='round_cannot_void';
  end if;
  update public.gift_assignment_rounds set status='voided' where id=p_round_id;
  update public.bunutan_sessions set event_status='registration_closed' where id=p_session_id;
  return true;
end;
$$;

create function public.cancel_gift_exchange(p_session_id uuid,p_capability text,p_rate_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions;
begin
  v_session:=private.authorize_session(p_session_id,p_capability,p_rate_key,true,true);
  if v_session.is_online_event and v_session.event_status='cancelled' then return true; end if;
  if not v_session.is_online_event or v_session.event_status='completed' then raise exception using errcode='P0001',message='event_cannot_cancel'; end if;
  update public.bunutan_sessions set event_status='cancelled' where id=p_session_id;
  return true;
end;
$$;

create function public.complete_gift_exchange(p_session_id uuid,p_capability text,p_rate_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions;
begin
  v_session:=private.authorize_session(p_session_id,p_capability,p_rate_key,true,true);
  if v_session.is_online_event and v_session.event_status='completed' then return true; end if;
  if not v_session.is_online_event or v_session.event_status<>'assignments_generated'
     or exists(select 1 from public.gift_assignments a join public.gift_assignment_rounds r on r.id=a.round_id
       where a.session_id=p_session_id and r.status='ready' and a.revealed_at is null) then raise exception using errcode='P0001',message='reveals_remaining'; end if;
  update public.gift_assignment_rounds set status='completed',completed_at=pg_catalog.now() where session_id=p_session_id and status='ready';
  update public.bunutan_sessions set event_status='completed' where id=p_session_id;
  return true;
end;
$$;

create or replace function public.get_bunutan_session(p_session_id uuid,p_capability text,p_rate_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions; v_participants jsonb; v_rounds jsonb;
begin
  v_session:=private.authorize_session(p_session_id,p_capability,p_rate_key,true,false);
  perform private.enforce_rate_limit(p_rate_key,'read:'||p_session_id::text,180,60);
  if v_session.status='active' then
    update public.bunutan_sessions set last_activity_at=pg_catalog.now(),updated_at=pg_catalog.now(),
      expires_at=case when is_online_event then greatest(pg_catalog.now()+interval '30 days',coalesce(registration_deadline+interval '60 days',pg_catalog.now()+interval '30 days'),coalesce(assignment_release_at+interval '60 days',pg_catalog.now()+interval '30 days'),coalesce(event_date+interval '60 days',pg_catalog.now()+interval '30 days')) else pg_catalog.now()+interval '30 days' end,
      recovery_expires_at=case when is_online_event then greatest(pg_catalog.now()+interval '60 days',coalesce(registration_deadline+interval '60 days',pg_catalog.now()+interval '60 days'),coalesce(assignment_release_at+interval '60 days',pg_catalog.now()+interval '60 days'),coalesce(event_date+interval '60 days',pg_catalog.now()+interval '60 days')) else pg_catalog.now()+interval '60 days' end where id=p_session_id;
    select * into v_session from public.bunutan_sessions where id=p_session_id;
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',p.id,'display_name',p.display_name,'status',p.status,'created_at',p.created_at) order by p.created_at,p.id),'[]'::jsonb)
    into v_participants from public.participants p where p.session_id=p_session_id;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',r.id,'round_number',r.round_number,'status',r.status,'started_at',r.started_at,
    'participant_count',(select count(*)::int from public.draw_round_participants rp where rp.round_id=r.id),
    'results',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',dr.id,'participant_id',dr.participant_id,'display_name',rp.display_name,'draw_order',dr.draw_order,'drawn_at',dr.drawn_at) order by dr.draw_order),'[]'::jsonb)
      from public.draw_results dr join public.draw_round_participants rp on rp.round_id=dr.round_id and rp.participant_id=dr.participant_id where dr.round_id=r.id)) order by r.round_number desc),'[]'::jsonb)
    into v_rounds from public.draw_rounds r where r.session_id=p_session_id;
  return pg_catalog.jsonb_build_object('session',pg_catalog.jsonb_build_object('id',v_session.id,'session_name',v_session.session_name,
    'description',v_session.description,'public_id',v_session.public_id,'status',v_session.status,'is_online_event',v_session.is_online_event,
    'event_status',v_session.event_status,'created_at',v_session.created_at,'expires_at',v_session.expires_at),
    'participants',v_participants,'rounds',v_rounds);
end;
$$;

create or replace function public.purge_expired_bunutan_sessions()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_deleted integer;
begin
  perform pg_catalog.set_config('app.online_event_write','on',true);
  delete from public.gift_assignments a using public.bunutan_sessions s where a.session_id=s.id and s.recovery_expires_at<=pg_catalog.now();
  delete from public.participant_wishlists w using public.bunutan_sessions s where w.session_id=s.id and s.recovery_expires_at<=pg_catalog.now();
  delete from public.gift_assignment_rounds r using public.bunutan_sessions s where r.session_id=s.id and s.recovery_expires_at<=pg_catalog.now();
  delete from public.draw_results dr using public.bunutan_sessions s where dr.session_id=s.id and s.recovery_expires_at<=pg_catalog.now();
  delete from public.draw_round_participants rp using public.bunutan_sessions s where rp.session_id=s.id and s.recovery_expires_at<=pg_catalog.now();
  delete from public.draw_rounds r using public.bunutan_sessions s where r.session_id=s.id and s.recovery_expires_at<=pg_catalog.now();
  delete from public.participants p using public.bunutan_sessions s where p.session_id=s.id and s.recovery_expires_at<=pg_catalog.now();
  delete from public.bunutan_sessions s where s.recovery_expires_at<=pg_catalog.now();
  get diagnostics v_deleted=row_count;
  delete from private.rate_limits where window_start<pg_catalog.now()-interval '2 days';
  return v_deleted;
end;
$$;

revoke all on function private.random_index(integer) from public,anon,authenticated;
revoke all on function private.authorize_gift_participant(text,text) from public,anon,authenticated;
revoke all on function private.guard_online_roster_write() from public,anon,authenticated;
revoke all on function private.guard_online_raffle_round() from public,anon,authenticated;
revoke all on function private.guard_online_archive() from public,anon,authenticated;
revoke all on function public.get_bunutan_session(uuid,text,text) from public,anon,authenticated;
revoke all on function public.purge_expired_bunutan_sessions() from public,anon,authenticated;
grant execute on function public.get_bunutan_session(uuid,text,text) to service_role;
grant execute on function public.purge_expired_bunutan_sessions() to service_role;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('create_online_bunutan_session','open_bunutan_registration','close_bunutan_registration',
      'add_gift_exchange_invites','update_gift_invitation','revoke_gift_invitation','rotate_gift_participant_token',
      'rotate_gift_participant_tokens',
      'get_online_event_dashboard','get_public_online_event','claim_gift_invitation','get_gift_invite_portal',
      'confirm_gift_participation','save_participant_wishlist','lock_gift_roster','generate_gift_assignments',
      'reveal_gift_assignment','void_gift_assignment_round','cancel_gift_exchange','complete_gift_exchange')
  loop
    execute pg_catalog.format('revoke all on function %s from public,anon,authenticated',r.signature);
    execute pg_catalog.format('grant execute on function %s to service_role',r.signature);
  end loop;
end;
$$;

create or replace function private.authorize_session(
  p_session_id uuid, p_capability text, p_rate_key text, p_lock boolean default false, p_write boolean default false
)
returns public.bunutan_sessions language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions;
begin
  perform private.enforce_rate_limit(p_rate_key, 'manage:global', 240, 60);
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

create or replace function public.recover_bunutan_session(
  p_session_id uuid, p_recovery_hash text, p_management_hash text, p_rate_key text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_session public.bunutan_sessions;
begin
  perform private.enforce_rate_limit(p_rate_key, 'recover:global', 20, 3600);
  perform private.enforce_rate_limit(p_rate_key, 'recover:' || p_session_id::text, 8, 3600);
  select * into v_session from public.bunutan_sessions s where s.id = p_session_id for update;
  if not found or v_session.recovery_code_hash is null or v_session.recovery_code_hash <> p_recovery_hash
     or v_session.recovery_expires_at <= pg_catalog.now() or p_management_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0002', message = 'recovery_failed';
  end if;
  update public.bunutan_sessions set management_token_hash = p_management_hash, recovery_code_hash = null,
    last_activity_at = pg_catalog.now(), updated_at = pg_catalog.now(),
    expires_at = pg_catalog.now() + interval '30 days', recovery_expires_at = pg_catalog.now() + interval '60 days'
  where id = p_session_id;
  return true;
end;
$$;

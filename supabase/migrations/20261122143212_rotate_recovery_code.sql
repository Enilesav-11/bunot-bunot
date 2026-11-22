create function public.rotate_bunutan_recovery_code(
  p_session_id uuid, p_capability text, p_rate_key text, p_recovery_hash text
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform private.authorize_session(p_session_id, p_capability, p_rate_key, true, true);
  perform private.enforce_rate_limit(p_rate_key, 'recovery_code:' || p_session_id::text, 8, 3600);
  if p_recovery_hash is null or p_recovery_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_recovery_hash';
  end if;
  update public.bunutan_sessions set recovery_code_hash = p_recovery_hash,
    recovery_expires_at = pg_catalog.now() + interval '60 days'
  where id = p_session_id;
  return true;
end;
$$;

revoke all on function public.rotate_bunutan_recovery_code(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.rotate_bunutan_recovery_code(uuid, text, text, text) to service_role;
